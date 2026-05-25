import { BadRequestException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

function makePrisma(state: { categories: any[]; transactions?: any[]; splits?: any[]; rules?: any[] }) {
  const cats = state.categories;
  const txs = state.transactions ?? [];
  const splits = state.splits ?? [];
  const rules = state.rules ?? [];
  return {
    category: {
      findMany: jest.fn(async ({ where, orderBy, include } = {} as any) => {
        let rows = cats.slice();
        if (where?.parentId !== undefined) rows = rows.filter((c) => c.parentId === where.parentId);
        if (include?._count) {
          rows = rows.map((c) => ({
            ...c,
            _count: {
              transactions: txs.filter((t) => t.categoryId === c.id).length,
              transactionSplits: splits.filter((s) => s.categoryId === c.id).length,
              rules: rules.filter((r) => r.categoryId === c.id).length,
              children: cats.filter((cc) => cc.parentId === c.id).length,
            },
          }));
        }
        return rows;
      }),
      findFirst: jest.fn(async ({ where } = {} as any) => {
        const nameEq = where?.name?.equals?.toLowerCase?.();
        const excludeId = where?.NOT?.id;
        return (
          cats.find((c) =>
            (nameEq === undefined || c.name.toLowerCase() === nameEq) &&
            (where?.parentId === undefined || c.parentId === where.parentId) &&
            (excludeId === undefined || c.id !== excludeId),
          ) ?? null
        );
      }),
      findUnique: jest.fn(async ({ where: { id } }: any) => cats.find((c) => c.id === id) ?? null),
      count: jest.fn(async ({ where: { parentId } }: any) => cats.filter((c) => c.parentId === parentId).length),
      create: jest.fn(async ({ data }: any) => { const row = { id: `c${cats.length + 1}`, ...data }; cats.push(row); return row; }),
      update: jest.fn(async ({ where: { id }, data }: any) => { const i = cats.findIndex((c) => c.id === id); cats[i] = { ...cats[i], ...data }; return cats[i]; }),
      delete: jest.fn(async ({ where: { id } }: any) => { const i = cats.findIndex((c) => c.id === id); const r = cats[i]; cats.splice(i, 1); return r; }),
    },
    transaction: {
      count: jest.fn(async ({ where: { categoryId } }: any) => txs.filter((t) => t.categoryId === categoryId).length),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let updated = 0;
        for (const t of txs) {
          if (t.categoryId === where.categoryId) {
            t.categoryId = data.categoryId;
            updated++;
          }
        }
        return { count: updated };
      }),
    },
    transactionSplit: {
      count: jest.fn(async ({ where: { categoryId } }: any) => splits.filter((s) => s.categoryId === categoryId).length),
    },
    rule: {
      count: jest.fn(async ({ where: { categoryId } }: any) => rules.filter((r) => r.categoryId === categoryId).length),
    },
    $transaction: jest.fn(async (fn: any) => fn({
      category: {
        create: jest.fn(async ({ data }: any) => { const row = { id: `c${cats.length + 1}`, ...data }; cats.push(row); return row; }),
        update: jest.fn(async ({ where: { id }, data }: any) => { const i = cats.findIndex((c) => c.id === id); cats[i] = { ...cats[i], ...data }; return cats[i]; }),
      },
      transaction: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          let updated = 0;
          for (const t of txs) {
            if (t.categoryId === where.categoryId) { t.categoryId = data.categoryId; updated++; }
          }
          return { count: updated };
        }),
      },
    })),
  } as any;
}

describe('CategoriesService', () => {
  describe('create', () => {
    it('allows two categories named "Fees" under different parents (sibling-scoped)', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking',   name: 'Banking',   kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: null },
          { id: 'education', name: 'Education', kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: null },
          { id: 'bf',        name: 'Fees',      kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: 'banking' },
        ],
      });
      const svc = new CategoriesService(prisma);
      const created = await svc.create({ name: 'Fees', kind: 'EXPENSE' as any, parentId: 'education' });
      expect(created.name).toBe('Fees');
      expect(created.parentId).toBe('education');
    });

    it('rejects two siblings with the same name case-insensitively', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking', name: 'Banking', kind: 'EXPENSE', isActive: true, parentId: null },
          { id: 'bf',      name: 'Bank Fees', kind: 'EXPENSE', isActive: true, parentId: 'banking' },
        ],
      });
      await expect(new CategoriesService(prisma).create({ name: 'BANK FEES', kind: 'EXPENSE' as any, parentId: 'banking' }))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects subcategory whose kind differs from parent', async () => {
      const prisma = makePrisma({
        categories: [{ id: 'banking', name: 'Banking', kind: 'EXPENSE', isActive: true, parentId: null }],
      });
      await expect(new CategoriesService(prisma).create({ name: 'Refund', kind: 'INCOME' as any, parentId: 'banking' }))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects three-level nesting (parent already has a parent)', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking',  name: 'Banking',  kind: 'EXPENSE', parentId: null },
          { id: 'bankfees', name: 'BankFees', kind: 'EXPENSE', parentId: 'banking' },
        ],
      });
      await expect(new CategoriesService(prisma).create({ name: 'Wire Fees', kind: 'EXPENSE' as any, parentId: 'bankfees' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('rejects kind change when the category has children', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking', name: 'Banking', kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: null },
          { id: 'bf',      name: 'Bank Fees', kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: 'banking' },
        ],
      });
      await expect(new CategoriesService(prisma).update('banking', { kind: 'INCOME' as any }))
        .rejects.toThrow(BadRequestException);
    });

    it('allows promoting a subcategory to top-level by setting parentId to null', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking', name: 'Banking', kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: null },
          { id: 'bf',      name: 'Bank Fees', kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: 'banking' },
        ],
      });
      const updated = await new CategoriesService(prisma).update('bf', { parentId: null });
      expect(updated.parentId).toBeNull();
    });
  });

  describe('remove', () => {
    it('rejects deletion when category has children', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking', name: 'Banking', kind: 'EXPENSE', parentId: null },
          { id: 'bf',      name: 'Bank Fees', kind: 'EXPENSE', parentId: 'banking' },
        ],
      });
      await expect(new CategoriesService(prisma).remove('banking')).rejects.toThrow(ConflictException);
    });
  });

  describe('split', () => {
    it('is idempotent on a category that already has children', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking', name: 'Banking', kind: 'EXPENSE', isActive: true, parentId: null },
          { id: 'bf',      name: 'Bank Fees', kind: 'EXPENSE', isActive: true, parentId: 'banking' },
        ],
      });
      const r = await new CategoriesService(prisma).split('banking');
      expect(r.alreadyGroup).toBe(true);
    });

    it('creates "<Name> (general)" child and migrates existing transactions', async () => {
      const prisma = makePrisma({
        categories: [{ id: 'banking', name: 'Banking', kind: 'EXPENSE', isActive: true, parentId: null }],
        transactions: [{ id: 't1', categoryId: 'banking' }, { id: 't2', categoryId: 'banking' }],
      });
      const r = await new CategoriesService(prisma).split('banking');
      expect(r.alreadyGroup).toBe(false);
      expect(r.child.name).toBe('Banking (general)');
      expect(r.child.parentId).toBe('banking');
      expect(r.migratedCount).toBe(2);
    });
  });
});
