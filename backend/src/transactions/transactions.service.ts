import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListTransactionsDto } from './dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async get(id: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, kind: true } },
        vendor: { select: { id: true, name: true } },
        splits: { select: { id: true, categoryId: true, amount: true, notes: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!tx) throw new NotFoundException();
    return tx;
  }

  async list(q: ListTransactionsDto) {
    const where: Prisma.TransactionWhereInput = {};
    if (q.accountIds && q.accountIds.length > 0) {
      where.accountId = { in: q.accountIds };
    }
    if (q.dateFrom || q.dateTo) {
      where.date = {};
      if (q.dateFrom) (where.date as Prisma.DateTimeFilter).gte = new Date(q.dateFrom);
      if (q.dateTo) (where.date as Prisma.DateTimeFilter).lte = new Date(q.dateTo);
    }

    // Full-text search across description and notes.
    if (q.q) {
      where.OR = [
        { description: { contains: q.q, mode: 'insensitive' } },
        { notes: { contains: q.q, mode: 'insensitive' } },
      ];
    }

    // Category filtering — precedence: categoryId > categoryUncategorised > categoryKind.
    if (q.categoryId) {
      where.categoryId = q.categoryId;
    } else if (q.categoryUncategorised === 'true') {
      where.categoryId = null;
    } else if (q.categoryKind) {
      where.category = { kind: q.categoryKind };
    }

    // Vendor filtering — precedence: vendorId > vendorNone.
    if (q.vendorId) {
      where.vendorId = q.vendorId;
    } else if (q.vendorNone === 'true') {
      where.vendorId = null;
    }

    const sortBy = q.sortBy ?? 'date';
    const sortDir = q.sortDir ?? 'desc';
    const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [
      { [sortBy]: sortDir } as Prisma.TransactionOrderByWithRelationInput,
    ];
    // Stable secondary sort on id desc so same-date rows always come back in
    // the same order (paginating across same-day rows would otherwise jitter).
    orderBy.push({ id: 'desc' });

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 200;
    const skip = (page - 1) * pageSize;

    const [items, totalCount] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, kind: true } },
          vendor: { select: { id: true, name: true } },
          splits: { select: { id: true, categoryId: true, amount: true, notes: true }, orderBy: { position: 'asc' } },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { items, totalCount, page, pageSize };
  }

  async stats(accountIds?: string[]) {
    const where: any = accountIds?.length ? { accountId: { in: accountIds } } : {};
    const [total, categorised] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.count({ where: { ...where, categoryId: { not: null } } }),
    ]);
    return { total, categorised, uncategorised: total - categorised };
  }

  async setSplits(transactionId: string, splits: Array<{ categoryId: string; amount: number; notes?: string }>) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException();
    const expected = Number(tx.amount);
    const total = splits.reduce((acc, s) => acc + Number(s.amount), 0);
    if (Math.abs(expected - total) > 0.005) {
      throw new BadRequestException(`Splits sum ($${total.toFixed(2)}) must equal transaction amount ($${expected.toFixed(2)}).`);
    }
    return this.prisma.$transaction(async (db) => {
      await db.transactionSplit.deleteMany({ where: { transactionId } });
      for (let i = 0; i < splits.length; i++) {
        await db.transactionSplit.create({
          data: {
            transactionId,
            categoryId: splits[i].categoryId,
            amount: new Prisma.Decimal(splits[i].amount),
            notes: splits[i].notes ?? null,
            position: i,
          },
        });
      }
      await db.transaction.update({
        where: { id: transactionId },
        data: { categoryId: null, ruleId: null, categorisedAt: new Date() },
      });
      await db.categorisationEvent.create({
        data: {
          transactionId,
          source: 'USER',
          oldCategoryId: tx.categoryId,
          newCategoryId: null,
        },
      });
      return db.transaction.findUnique({
        where: { id: transactionId },
        include: { splits: { include: { category: true }, orderBy: { position: 'asc' } } },
      });
    });
  }

  async clearSplits(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { splits: { orderBy: { amount: 'desc' } } },
    });
    if (!tx) throw new NotFoundException();
    if (tx.splits.length === 0) return tx;
    const restoreCategoryId = tx.splits[0].categoryId;
    return this.prisma.$transaction(async (db) => {
      await db.transactionSplit.deleteMany({ where: { transactionId } });
      await db.transaction.update({
        where: { id: transactionId },
        data: { categoryId: restoreCategoryId, categorisedAt: new Date() },
      });
      await db.categorisationEvent.create({
        data: {
          transactionId, source: 'USER',
          oldCategoryId: null, newCategoryId: restoreCategoryId,
        },
      });
      return db.transaction.findUnique({ where: { id: transactionId } });
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException();
    await this.prisma.transaction.delete({ where: { id } });
  }

  async bulkDelete(ids: string[]): Promise<{ deleted: number }> {
    if (!ids.length) return { deleted: 0 };
    const result = await this.prisma.transaction.deleteMany({ where: { id: { in: ids } } });
    return { deleted: result.count };
  }

  async setCategory(transactionId: string, data: { categoryId?: string; vendorId?: string; notes?: string }) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException();
    return this.prisma.$transaction(async (db) => {
      const updated = await db.transaction.update({
        where: { id: transactionId },
        data: {
          categoryId: data.categoryId === undefined ? undefined : data.categoryId,
          vendorId: data.vendorId === undefined ? undefined : data.vendorId,
          notes: data.notes === undefined ? undefined : data.notes,
          categorisedAt: data.categoryId !== undefined ? new Date() : undefined,
          ruleId: data.categoryId !== undefined ? null : undefined,
        },
      });
      if (data.categoryId !== undefined && data.categoryId !== tx.categoryId) {
        await db.categorisationEvent.create({
          data: {
            transactionId, source: 'USER',
            oldCategoryId: tx.categoryId, newCategoryId: data.categoryId,
          },
        });
      }
      if (data.vendorId !== undefined && data.vendorId !== tx.vendorId) {
        await db.categorisationEvent.create({
          data: {
            transactionId, source: 'USER',
            oldVendorId: tx.vendorId, newVendorId: data.vendorId,
          },
        });
      }
      return updated;
    });
  }
}
