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

// ---------- write-path Prisma double ----------
function makeWritePrisma(state: any) {
  const find = (arr: any[], where: any): any =>
    arr.find((row: any) => Object.entries(where).every(([k, v]) => row[k] === v));

  const tx = {
    transaction: {
      findUnique: jest.fn(async ({ where, include }: any) => {
        const t = find(state.transactions, where);
        if (!t) return null;
        if (include?.allocations) {
          return {
            ...t,
            allocations: state.allocations.filter((a: any) => a.transactionId === t.id),
            vendor: t.vendorId ? find(state.vendors, { id: t.vendorId }) : null,
            account: find(state.accounts, { id: t.accountId }),
          };
        }
        return t;
      }),
    },
    invoice: {
      findMany: jest.fn(async ({ where }: any) => {
        let rows = state.invoices.slice();
        if (where?.id?.in) rows = rows.filter((r: any) => where.id.in.includes(r.id));
        if (where?.customerId) rows = rows.filter((r: any) => r.customerId === where.customerId);
        if (where?.status?.in) rows = rows.filter((r: any) => where.status.in.includes(r.status));
        return rows.map((r: any) => ({
          ...r,
          customer: r.customerId ? find(state.customers, { id: r.customerId }) : null,
        }));
      }),
      findUnique: jest.fn(async ({ where }: any) => find(state.invoices, where)),
      update: jest.fn(async ({ where, data }: any) => {
        const row = find(state.invoices, where)!;
        Object.assign(row, data);
        return row;
      }),
    },
    allocation: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `alloc-${state.allocations.length + 1}`, createdAt: new Date(), ...data };
        state.allocations.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) => state.allocations.filter((a: any) => a.invoiceId === where.invoiceId)),
      findUnique: jest.fn(async ({ where }: any) => find(state.allocations, where)),
      delete: jest.fn(async ({ where }: any) => {
        const i = state.allocations.findIndex((a: any) => a.id === where.id);
        const [row] = state.allocations.splice(i, 1);
        return row;
      }),
    },
    allocationEvent: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `ev-${state.events.length + 1}`, createdAt: new Date(), ...data };
        state.events.push(row);
        return row;
      }),
    },
    vendor: {
      update: jest.fn(async ({ where, data }: any) => {
        const row = find(state.vendors, where)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
  return {
    _state: state,
    ...tx,
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  } as any;
}

function seedInvoice(state: any, over: any = {}) {
  const id = over.id ?? `inv-${state.invoices.length + 1}`;
  const row = {
    id,
    invoiceNumber: over.invoiceNumber ?? 1000 + state.invoices.length,
    customerId: over.customerId ?? 'c1',
    invoiceDate: over.invoiceDate ?? new Date('2026-01-01'),
    totalAmount: new Decimal(over.totalAmount ?? '100.00'),
    amountPaid: new Decimal('0'),
    amountOutstanding: new Decimal(over.totalAmount ?? '100.00'),
    status: over.status ?? 'SENT',
    viewedAt: over.viewedAt ?? null,
    sendAttempts: over.sendAttempts ?? 1,
  };
  state.invoices.push(row);
  return row;
}

describe('PaymentsService.applyAllocations', () => {
  function baseState() {
    return {
      accounts: [{ id: 'acc1', name: 'Op' }],
      customers: [{ id: 'c1', name: 'Cust' }],
      vendors: [{ id: 'v1', name: 'V', customerId: 'c1' }],
      transactions: [{ id: 'tx1', accountId: 'acc1', vendorId: 'v1', amount: new Decimal('300.00'), description: 'pmt', date: new Date('2026-01-10') }],
      invoices: [],
      allocations: [],
      events: [],
    };
  }

  it('happy path: 3 invoices, statuses go PAID + PARTIAL_PAID + PAID, events written', async () => {
    const state = baseState();
    seedInvoice(state, { id: 'i1', totalAmount: '100.00' });
    seedInvoice(state, { id: 'i2', totalAmount: '100.00' });
    seedInvoice(state, { id: 'i3', totalAmount: '50.00' });
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    const r = await svc.applyAllocations('tx1', [
      { invoiceId: 'i1', amount: '100.00' },
      { invoiceId: 'i2', amount: '40.00' },
      { invoiceId: 'i3', amount: '50.00' },
    ]);
    const byId = (id: string): any => state.invoices.find((i: any) => i.id === id);
    expect(byId('i1')!.status).toBe('PAID');
    expect(byId('i2')!.status).toBe('PARTIAL_PAID');
    expect(byId('i3')!.status).toBe('PAID');
    expect(state.events.filter((e: any) => e.eventType === 'CREATED')).toHaveLength(3);
    expect(r.invoices).toHaveLength(3);
  });

  it('partial payment leaves PARTIAL_PAID + remaining unallocated stays as credit', async () => {
    const state = baseState();
    seedInvoice(state, { id: 'i1', totalAmount: '100.00' });
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await svc.applyAllocations('tx1', [{ invoiceId: 'i1', amount: '40.00' }]);
    const inv: any = state.invoices.find((i: any) => i.id === 'i1');
    expect(inv!.status).toBe('PARTIAL_PAID');
    expect(inv!.amountOutstanding.toString()).toBe('60');
  });

  it('rejects allocation > invoice.amountOutstanding (overpay-single)', async () => {
    const state = baseState();
    seedInvoice(state, { id: 'i1', totalAmount: '100.00' });
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await expect(
      svc.applyAllocations('tx1', [{ invoiceId: 'i1', amount: '150.00' }]),
    ).rejects.toThrow(/exceeds.*outstanding/i);
  });

  it('rejects sum(allocations) > transaction.unallocated', async () => {
    const state = baseState();
    seedInvoice(state, { id: 'i1', totalAmount: '500.00' });
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await expect(
      svc.applyAllocations('tx1', [{ invoiceId: 'i1', amount: '400.00' }]),
    ).rejects.toThrow(/exceeds.*unallocated/i);
  });

  it('rejects DRAFT invoice', async () => {
    const state = baseState();
    seedInvoice(state, { id: 'i1', totalAmount: '100.00', status: 'DRAFT' });
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await expect(
      svc.applyAllocations('tx1', [{ invoiceId: 'i1', amount: '100.00' }]),
    ).rejects.toThrow(/status/i);
  });

  it('rejects PAID invoice (409 conflict)', async () => {
    const state = baseState();
    seedInvoice(state, { id: 'i1', totalAmount: '100.00', status: 'PAID' });
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await expect(
      svc.applyAllocations('tx1', [{ invoiceId: 'i1', amount: '50.00' }]),
    ).rejects.toThrow(/status/i);
  });

  it('rejects VOID invoice', async () => {
    const state = baseState();
    seedInvoice(state, { id: 'i1', totalAmount: '100.00', status: 'VOID' });
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await expect(
      svc.applyAllocations('tx1', [{ invoiceId: 'i1', amount: '50.00' }]),
    ).rejects.toThrow(/status/i);
  });

  it('rejects allocation amount <= 0', async () => {
    const state = baseState();
    seedInvoice(state, { id: 'i1', totalAmount: '100.00' });
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await expect(
      svc.applyAllocations('tx1', [{ invoiceId: 'i1', amount: '0' }]),
    ).rejects.toThrow(/must be > 0/i);
  });

  it('bindVendorToCustomerId writes Vendor.customerId', async () => {
    const state = baseState();
    (state.vendors[0] as any).customerId = null; // unlinked
    seedInvoice(state, { id: 'i1', totalAmount: '100.00' });
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await svc.applyAllocations('tx1', [{ invoiceId: 'i1', amount: '100.00' }], 'c1');
    expect(state.vendors[0].customerId).toBe('c1');
  });
});
