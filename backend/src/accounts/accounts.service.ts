import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  // Case-insensitive name uniqueness. Active and archived accounts share the
  // namespace — restoring an archive with the same name as a new account
  // would otherwise fail at the DB unique index anyway, so we may as well
  // give a clean error up front.
  private async assertNameAvailable(name: string, excludeId?: string) {
    const trimmed = name.trim();
    const clash = await this.prisma.account.findFirst({
      where: {
        name: { equals: trimmed, mode: 'insensitive' },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new BadRequestException(
        `An account named "${clash.name}" already exists. Account names must be unique.`,
      );
    }
  }

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

  async create(data: CreateAccountDto) {
    await this.assertNameAvailable(data.name);
    return this.prisma.account.create({
      data: {
        name: data.name.trim(),
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
    if (data.name !== undefined) await this.assertNameAvailable(data.name, id);
    return this.prisma.account.update({
      where: { id },
      data: {
        name: data.name?.trim(),
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
