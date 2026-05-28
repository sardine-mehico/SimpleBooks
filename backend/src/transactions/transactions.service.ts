import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';
import { CreateTransactionDto, ListTransactionsDto, UpdateTransactionDto } from './dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService, private tags: TagsService) {}

  async get(id: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, kind: true } },
        transactionTags: {
          select: { tag: { select: { id: true, name: true, color: true } }, source: true },
        },
        splits: { select: { id: true, categoryId: true, amount: true, notes: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!tx) throw new NotFoundException();
    const [withBalance] = await this.attachComputedBalance([tx]);
    const latest = await this.prisma.categorisationEvent.findFirst({
      where: {
        transactionId: id,
        source: { in: ['USER', 'AI_APPLIED', 'RULE'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        provider: { select: { name: true } },
        rule: { select: { name: true } },
      },
    });
    const categorisationProvenance = latest ? {
      source: latest.source,
      at: latest.createdAt.toISOString(),
      providerName: latest.provider?.name ?? null,
      ruleName: latest.rule?.name ?? null,
    } : null;
    return { ...withBalance, categorisationProvenance };
  }

  /**
   * Attach a server-computed `runningBalance` (string) to each item using a
   * SUM(...) OVER (PARTITION BY accountId ORDER BY date ASC, id ASC) window
   * over the UNFILTERED per-account history. The balance is correct for the
   * given rows regardless of any date/category/q filters or pagination upstream.
   *
   * Same-day order tiebreaker is (id ASC) — deterministic but arbitrary;
   * for same-day rows the per-row balance may not match the bank's statement
   * ordering. Documented in CLAUDE.md known-gotchas.
   */
  private async attachComputedBalance<T extends { id: string; accountId: string }>(
    items: T[],
  ): Promise<Array<T & { runningBalance: string | null }>> {
    if (items.length === 0) return [];
    const visibleIds = items.map((i) => i.id);
    const accountIds = Array.from(new Set(items.map((i) => i.accountId)));
    const balanceRows = await this.prisma.$queryRaw<Array<{ id: string; running_balance: string }>>`
      SELECT id, running_balance::text AS running_balance FROM (
        SELECT t.id, a."openingBalance" + SUM(t.amount) OVER (
          PARTITION BY t."accountId" ORDER BY t.date ASC, t.id ASC
        ) AS running_balance
        FROM "Transaction" t
        JOIN "Account" a ON a.id = t."accountId"
        WHERE t."accountId" = ANY(${accountIds}::text[])
      ) AS x
      WHERE id = ANY(${visibleIds}::text[])
    `;
    const balancesById = new Map(balanceRows.map((r) => [r.id, r.running_balance]));
    return items.map((i) => ({ ...i, runningBalance: balancesById.get(i.id) ?? null }));
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

    // Tag filtering — precedence: tagIds (OR semantics) > tagNone.
    if (q.tagIds && q.tagIds.length > 0) {
      where.transactionTags = { some: { tagId: { in: q.tagIds } } };
    } else if (q.tagNone === 'true') {
      where.transactionTags = { none: {} };
    }

    // Pending AI review filter — transactions with an unresolved AI_DRAFT.
    if (q.pendingAiReview === 'true') {
      const drafts = await this.prisma.categorisationEvent.findMany({
        where: { source: 'AI_DRAFT' },
        select: { transactionId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      const resolutions = await this.prisma.categorisationEvent.findMany({
        where: { source: { in: ['AI_APPLIED', 'AI_REJECTED'] } },
        select: { transactionId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      const latestResolutionByTx = new Map<string, Date>();
      for (const r of resolutions) {
        if (!latestResolutionByTx.has(r.transactionId)) {
          latestResolutionByTx.set(r.transactionId, r.createdAt);
        }
      }
      const unresolvedTxIds = new Set<string>();
      for (const d of drafts) {
        if (unresolvedTxIds.has(d.transactionId)) continue;
        const resolution = latestResolutionByTx.get(d.transactionId);
        if (resolution && resolution > d.createdAt) continue;
        unresolvedTxIds.add(d.transactionId);
      }
      where.id = { in: [...unresolvedTxIds] };
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
          transactionTags: {
            select: { tag: { select: { id: true, name: true, color: true } }, source: true },
          },
          splits: { select: { id: true, categoryId: true, amount: true, notes: true }, orderBy: { position: 'asc' } },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    const itemsWithBalance = await this.attachComputedBalance(items);

    return { items: itemsWithBalance, totalCount, page, pageSize };
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
    const parentCategoryCount = await this.prisma.category.count({
      where: { id: { in: splits.map(s => s.categoryId) }, children: { some: {} } },
    });
    if (parentCategoryCount > 0) {
      throw new BadRequestException('Cannot assign a parent category to a split. Pick a subcategory.');
    }
    const expected = Number(tx.amount);
    const total = splits.reduce((acc, s) => acc + Number(s.amount), 0);
    if (Math.abs(expected - total) > 0.005) {
      throw new BadRequestException(`Splits sum ($${total.toFixed(2)}) must equal transaction amount ($${expected.toFixed(2)}).`);
    }
    const updated = await this.prisma.$transaction(async (db) => {
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
    if (!updated) return updated;
    const [withBalance] = await this.attachComputedBalance([updated]);
    return withBalance;
  }

  async clearSplits(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { splits: { orderBy: { amount: 'desc' } } },
    });
    if (!tx) throw new NotFoundException();
    if (tx.splits.length === 0) {
      const [withBalance] = await this.attachComputedBalance([tx]);
      return withBalance;
    }
    const restoreCategoryId = tx.splits[0].categoryId;
    const updated = await this.prisma.$transaction(async (db) => {
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
    if (!updated) return updated;
    const [withBalance] = await this.attachComputedBalance([updated]);
    return withBalance;
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

  async setCategory(transactionId: string, data: { categoryId?: string; notes?: string }) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException();
    if (data.categoryId) {
      const childCount = await this.prisma.category.count({ where: { parentId: data.categoryId } });
      if (childCount > 0) {
        throw new BadRequestException('Cannot assign a parent category to a transaction. Pick a subcategory.');
      }
    }
    const updated = await this.prisma.$transaction(async (db) => {
      const updated = await db.transaction.update({
        where: { id: transactionId },
        data: {
          categoryId: data.categoryId === undefined ? undefined : data.categoryId,
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
      return updated;
    });
    const [withBalance] = await this.attachComputedBalance([updated]);
    return withBalance;
  }

  // Manually create a transaction (UI "Add Transaction" button). CSV imports use
  // a deterministic importHash for dedupe; manual creates get a synthetic
  // `manual:<uuid>` hash so they never collide with an imported row and never
  // dedupe against each other.
  async create(data: CreateTransactionDto) {
    if (data.categoryId) {
      const childCount = await this.prisma.category.count({ where: { parentId: data.categoryId } });
      if (childCount > 0) {
        throw new BadRequestException('Cannot assign a parent category to a transaction. Pick a subcategory.');
      }
    }
    const tx = await this.prisma.transaction.create({
      data: {
        accountId: data.accountId,
        date: new Date(data.date),
        amount: new Prisma.Decimal(data.amount.toFixed ? data.amount.toFixed(2) : String(data.amount)),
        description: data.description,
        categoryId: data.categoryId ?? null,
        notes: data.notes ?? null,
        categorisedAt: data.categoryId ? new Date() : null,
        importHash: `manual:${randomUUID()}`,
        importId: null,
      },
    });
    if (data.categoryId) {
      await this.prisma.categorisationEvent.create({
        data: {
          transactionId: tx.id,
          source: 'USER',
          newCategoryId: data.categoryId,
        },
      });
    }
    if (data.tagIds && data.tagIds.length > 0) {
      await this.tags.setTransactionTags(tx.id, data.tagIds, 'USER');
    }
    const [withBalance] = await this.attachComputedBalance([tx]);
    return withBalance;
  }

  // Generic update for core fields (date/amount/description/account/notes).
  // Category changes still go through setCategory because they emit a
  // distinct CategorisationEvent and clear ruleId. Tag changes go through
  // PATCH /:id/tags. Mixing here would confuse the audit semantics.
  async updateFields(id: string, data: UpdateTransactionDto) {
    const existing = await this.prisma.transaction.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
        ...(data.date !== undefined ? { date: new Date(data.date) } : {}),
        ...(data.amount !== undefined
          ? { amount: new Prisma.Decimal(data.amount.toFixed ? data.amount.toFixed(2) : String(data.amount)) }
          : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
    const [withBalance] = await this.attachComputedBalance([updated]);
    return withBalance;
  }
}
