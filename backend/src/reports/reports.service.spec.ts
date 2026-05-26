// backend/src/reports/reports.service.spec.ts
import { ReportsService } from './reports.service';

function makePrisma(state: { catRows: any[]; uncatTotal: string | number }) {
  return {
    $queryRaw: jest.fn(async (sqlTemplate: any, ..._args: any[]) => {
      // Distinguish the two query calls by the SQL fragment passed in.
      // The first SELECT … FROM "Transaction" t JOIN "Category" c is the category rollup;
      // the second is the uncategorised total.
      const sqlString = sqlTemplate.strings ? sqlTemplate.strings.join('') : String(sqlTemplate);
      if (sqlString.includes('JOIN "Category"')) return state.catRows;
      return [{ total: String(state.uncatTotal) }];
    }),
    preferences: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Australia/Perth' }) },
  } as any;
}

describe('ReportsService.getReport', () => {
  it('returns zero-state when there are no transactions in range', async () => {
    const prisma = makePrisma({ catRows: [], uncatTotal: '0' });
    const svc = new ReportsService(prisma);
    const r = await svc.getReport('EXPENSE', { from: '2026-05-01', to: '2026-05-31' });
    expect(r.parents).toEqual([]);
    expect(r.uncategorised).toBe('0.00');
    expect(r.grandTotal).toBe('0.00');
  });

  it('rolls up two child totals into the parent and sorts parents by total desc', async () => {
    const prisma = makePrisma({
      catRows: [
        { rollupId: 'banking', leafId: 'bf',   leafName: 'Bank Fees',      parentName: 'Banking',  total: '112.00' },
        { rollupId: 'banking', leafId: 'of',   leafName: 'Overdraft Fees', parentName: 'Banking',  total: '45.00' },
        { rollupId: 'rent',    leafId: 'rent', leafName: 'Rent',           parentName: null,       total: '5000.00' },
      ],
      uncatTotal: '0',
    });
    const svc = new ReportsService(prisma);
    const r = await svc.getReport('EXPENSE', { from: '2026-05-01', to: '2026-05-31' });
    expect(r.parents).toHaveLength(2);
    expect(r.parents[0].name).toBe('Rent');
    expect(r.parents[0].total).toBe('5000.00');
    expect(r.parents[0].children).toEqual([]);
    expect(r.parents[1].name).toBe('Banking');
    expect(r.parents[1].total).toBe('157.00');
    expect(r.parents[1].children.map((c: any) => c.name)).toEqual(['Bank Fees', 'Overdraft Fees']);
    expect(r.grandTotal).toBe('5157.00');
  });

  it('includes uncategorised total when present', async () => {
    const prisma = makePrisma({
      catRows: [{ rollupId: 'x', leafId: 'x', leafName: 'X', parentName: null, total: '100.00' }],
      uncatTotal: '50.00',
    });
    const r = await new ReportsService(prisma).getReport('EXPENSE', { from: '2026-05-01', to: '2026-05-31' });
    expect(r.uncategorised).toBe('50.00');
    expect(r.grandTotal).toBe('150.00');
  });
});
