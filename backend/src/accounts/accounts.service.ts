import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async list(includeInactive = false) {
    const rows = await this.prisma.account.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        accountType: true,
        _count: { select: { transactions: true } },
      },
    });
    // Compute currentBalance for each account in one extra aggregate query.
    const sums = await this.prisma.transaction.groupBy({
      by: ['accountId'],
      _sum: { amount: true },
      where: { accountId: { in: rows.map((r) => r.id) } },
    });
    const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum.amount ?? new Prisma.Decimal(0)]));
    return rows.map((r) => ({
      ...r,
      currentBalance: new Prisma.Decimal(r.openingBalance).plus(sumByAccount.get(r.id) ?? 0).toString(),
    }));
  }

  async get(id: string) {
    const row = await this.prisma.account.findUnique({
      where: { id },
      include: {
        accountType: true,
        _count: { select: { transactions: true, imports: true } },
      },
    });
    if (!row) throw new NotFoundException();
    const sum = await this.prisma.transaction.aggregate({
      where: { accountId: id },
      _sum: { amount: true },
    });
    const latestImport = await this.prisma.transactionImport.findFirst({
      where: { accountId: id },
      orderBy: { importedAt: 'desc' },
      select: { id: true, importedAt: true, rowsImported: true },
    });
    return {
      ...row,
      currentBalance: new Prisma.Decimal(row.openingBalance)
        .plus(sum._sum.amount ?? 0)
        .toString(),
      latestImport,
    };
  }

  create(data: CreateAccountDto) {
    return this.prisma.account.create({
      data: {
        name: data.name,
        bank: data.bank,
        accountNumber: data.accountNumber,
        accountTypeId: data.accountTypeId,
        openingBalance: data.openingBalance,
        openingDate: new Date(data.openingDate),
        notes: data.notes,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: UpdateAccountDto) {
    await this.get(id);
    return this.prisma.account.update({
      where: { id },
      data: {
        name: data.name,
        bank: data.bank,
        accountNumber: data.accountNumber,
        accountTypeId: data.accountTypeId,
        openingBalance: data.openingBalance,
        openingDate: data.openingDate ? new Date(data.openingDate) : undefined,
        notes: data.notes,
        isActive: data.isActive,
      },
    });
  }

  async archive(id: string) {
    await this.get(id);
    return this.prisma.account.update({ where: { id }, data: { isActive: false } });
  }

  async restore(id: string) {
    await this.get(id);
    return this.prisma.account.update({ where: { id }, data: { isActive: true } });
  }
}
