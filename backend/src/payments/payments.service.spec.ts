import { Decimal } from '@prisma/client/runtime/library';
import { PaymentsService } from './payments.service';

// Hand-rolled Prisma double. Each test populates the in-memory tables.
function makePrisma(state: any) {
  const find = (arr: any[], where: any): any =>
    arr.find((row: any) => Object.entries(where).every(([k, v]) => row[k] === v));
  return {
    _state: state,
    transaction: {
      findUnique: jest.fn(async ({ where }: any) => {
        const tx = find(state.transactions, where);
        if (!tx) return null;
        return {
          ...tx,
          allocations: state.allocations.filter((a: any) => a.transactionId === tx.id),
          vendor: tx.vendorId ? find(state.vendors, { id: tx.vendorId }) : null,
          account: find(state.accounts, { id: tx.accountId }),
        };
      }),
    },
    invoice: {
      findMany: jest.fn(async ({ where }: any) => {
        let rows = state.invoices.slice();
        if (where?.customerId) rows = rows.filter((r: any) => r.customerId === where.customerId);
        if (where?.status?.in) rows = rows.filter((r: any) => where.status.in.includes(r.status));
        return rows.map((r: any) => ({
          ...r,
          customer: r.customerId ? find(state.customers, { id: r.customerId }) : null,
        }));
      }),
    },
  } as any;
}

describe('PaymentsService.getCandidates', () => {
  it('returns scored candidates for a customer-linked transaction', async () => {
    const prisma = makePrisma({
      accounts: [{ id: 'acc1', name: 'Operating' }],
      customers: [{ id: 'c1', name: 'Office Cleaners' }],
      vendors: [{ id: 'v1', name: 'OFFICE CLEANERS PTY', customerId: 'c1' }],
      transactions: [
        { id: 'tx1', accountId: 'acc1', vendorId: 'v1', amount: new Decimal('300.00'), description: 'PMT INV-1011', date: new Date('2026-01-10') },
      ],
      invoices: [
        { id: 'inv1', invoiceNumber: 1011, customerId: 'c1', invoiceDate: new Date('2026-01-01'), totalAmount: new Decimal('300.00'), amountOutstanding: new Decimal('300.00'), status: 'SENT' },
        { id: 'inv2', invoiceNumber: 1012, customerId: 'c1', invoiceDate: new Date('2026-01-05'), totalAmount: new Decimal('100.00'), amountOutstanding: new Decimal('100.00'), status: 'SENT' },
      ],
      allocations: [],
    });
    const svc = new PaymentsService(prisma);
    const r = await svc.getCandidates('tx1');
    expect(r.candidates).toHaveLength(2);
    // INV-1011 hits invoice# + exact-amount + date → 60+40+10 = 110
    const top = r.candidates[0];
    expect(top.invoiceNumber).toBe(1011);
    expect(top.score).toBeGreaterThanOrEqual(60 + 40 + 10);
  });

  it('suggests a 2-invoice bundle when the deposit exactly sums two open invoices', async () => {
    const prisma = makePrisma({
      accounts: [{ id: 'acc1', name: 'Operating' }],
      customers: [{ id: 'c1', name: 'Cust' }],
      vendors: [{ id: 'v1', name: 'V', customerId: 'c1' }],
      transactions: [
        { id: 'tx1', accountId: 'acc1', vendorId: 'v1', amount: new Decimal('300.00'), description: 'PMT', date: new Date('2026-01-10') },
      ],
      invoices: [
        { id: 'inv1', invoiceNumber: 1, customerId: 'c1', invoiceDate: new Date('2026-01-01'), totalAmount: new Decimal('100.00'), amountOutstanding: new Decimal('100.00'), status: 'SENT' },
        { id: 'inv2', invoiceNumber: 2, customerId: 'c1', invoiceDate: new Date('2026-01-02'), totalAmount: new Decimal('200.00'), amountOutstanding: new Decimal('200.00'), status: 'SENT' },
      ],
      allocations: [],
    });
    const svc = new PaymentsService(prisma);
    const r = await svc.getCandidates('tx1');
    expect(r.bundleSuggestion).not.toBeNull();
    expect(r.bundleSuggestion!.invoiceIds.sort()).toEqual(['inv1', 'inv2']);
  });

  it('returns empty candidates when vendor is not linked to a customer', async () => {
    const prisma = makePrisma({
      accounts: [{ id: 'acc1', name: 'Operating' }],
      customers: [],
      vendors: [{ id: 'v1', name: 'V', customerId: null }],
      transactions: [
        { id: 'tx1', accountId: 'acc1', vendorId: 'v1', amount: new Decimal('100.00'), description: 'pmt', date: new Date('2026-01-10') },
      ],
      invoices: [],
      allocations: [],
    });
    const svc = new PaymentsService(prisma);
    const r = await svc.getCandidates('tx1');
    expect(r.candidates).toEqual([]);
    expect(r.bundleSuggestion).toBeNull();
  });
});
