import { Decimal } from '@prisma/client/runtime/library';
import { PaymentsService } from './payments.service';

// Hand-rolled Prisma double. Each test populates the in-memory tables.
// After the Vendor->Tags migration, customer linkage comes from
// category.customerId and/or tag.customerId.
function makePrisma(state: any) {
  const find = (arr: any[], where: any): any =>
    arr.find((row: any) => Object.entries(where).every(([k, v]) => row[k] === v));
  return {
    _state: state,
    transaction: {
      findUnique: jest.fn(async ({ where }: any) => {
        const tx = find(state.transactions, where);
        if (!tx) return null;
        const category = tx.categoryId
          ? find(state.categories ?? [], { id: tx.categoryId })
          : null;
        const txTags = (state.transactionTags ?? [])
          .filter((tt: any) => tt.transactionId === tx.id)
          .map((tt: any) => ({ tag: find(state.tags ?? [], { id: tt.tagId }) }));
        return {
          ...tx,
          allocations: state.allocations.filter((a: any) => a.transactionId === tx.id),
          account: find(state.accounts, { id: tx.accountId }),
          category: category ? { customerId: category.customerId ?? null } : null,
          transactionTags: txTags,
        };
      }),
    },
    invoice: {
      findMany: jest.fn(async ({ where }: any) => {
        let rows = state.invoices.slice();
        if (where?.customerId) {
          if (typeof where.customerId === 'string') {
            rows = rows.filter((r: any) => r.customerId === where.customerId);
          } else if (Array.isArray(where.customerId?.in)) {
            rows = rows.filter((r: any) => where.customerId.in.includes(r.customerId));
          }
        }
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
  it('returns scored candidates for a category-linked transaction', async () => {
    const prisma = makePrisma({
      accounts: [{ id: 'acc1', name: 'Operating' }],
      customers: [{ id: 'c1', name: 'Office Cleaners' }],
      categories: [{ id: 'cat1', name: 'Cleaning revenue', customerId: 'c1' }],
      transactions: [
        { id: 'tx1', accountId: 'acc1', categoryId: 'cat1', amount: new Decimal('300.00'), description: 'PMT INV-1011', date: new Date('2026-01-10') },
      ],
      invoices: [
        { id: 'inv1', invoiceNumber: 1011, customerId: 'c1', invoiceDate: new Date('2026-01-01'), totalAmount: new Decimal('300.00'), amountOutstanding: new Decimal('300.00'), status: 'SENT' },
        { id: 'inv2', invoiceNumber: 1012, customerId: 'c1', invoiceDate: new Date('2026-01-05'), totalAmount: new Decimal('100.00'), amountOutstanding: new Decimal('100.00'), status: 'SENT' },
      ],
      allocations: [],
      tags: [],
      transactionTags: [],
    });
    const svc = new PaymentsService(prisma);
    const r = await svc.getCandidates('tx1');
    expect(r.candidates).toHaveLength(2);
    // INV-1011 hits invoice# + exact-amount + date + categoryCustomerMatch
    const top = r.candidates[0];
    expect(top.invoiceNumber).toBe(1011);
    expect(top.score).toBeGreaterThanOrEqual(60 + 40 + 10);
  });

  it('returns scored candidates when only a tag links to the customer', async () => {
    const prisma = makePrisma({
      accounts: [{ id: 'acc1', name: 'Operating' }],
      customers: [{ id: 'c1', name: 'Office Cleaners' }],
      categories: [{ id: 'cat1', name: 'Misc revenue', customerId: null }],
      tags: [{ id: 'tag1', name: 'Office Cleaners', customerId: 'c1' }],
      transactions: [
        { id: 'tx1', accountId: 'acc1', categoryId: 'cat1', amount: new Decimal('300.00'), description: 'PMT INV-1011', date: new Date('2026-01-10') },
      ],
      transactionTags: [{ transactionId: 'tx1', tagId: 'tag1' }],
      invoices: [
        { id: 'inv1', invoiceNumber: 1011, customerId: 'c1', invoiceDate: new Date('2026-01-01'), totalAmount: new Decimal('300.00'), amountOutstanding: new Decimal('300.00'), status: 'SENT' },
      ],
      allocations: [],
    });
    const svc = new PaymentsService(prisma);
    const r = await svc.getCandidates('tx1');
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].signals.tagCustomerMatch).toBe(true);
  });

  it('suggests a 2-invoice bundle when the deposit exactly sums two open invoices', async () => {
    const prisma = makePrisma({
      accounts: [{ id: 'acc1', name: 'Operating' }],
      customers: [{ id: 'c1', name: 'Cust' }],
      categories: [{ id: 'cat1', name: 'Rev', customerId: 'c1' }],
      transactions: [
        { id: 'tx1', accountId: 'acc1', categoryId: 'cat1', amount: new Decimal('300.00'), description: 'PMT', date: new Date('2026-01-10') },
      ],
      invoices: [
        { id: 'inv1', invoiceNumber: 1, customerId: 'c1', invoiceDate: new Date('2026-01-01'), totalAmount: new Decimal('100.00'), amountOutstanding: new Decimal('100.00'), status: 'SENT' },
        { id: 'inv2', invoiceNumber: 2, customerId: 'c1', invoiceDate: new Date('2026-01-02'), totalAmount: new Decimal('200.00'), amountOutstanding: new Decimal('200.00'), status: 'SENT' },
      ],
      allocations: [],
      tags: [],
      transactionTags: [],
    });
    const svc = new PaymentsService(prisma);
    const r = await svc.getCandidates('tx1');
    expect(r.bundleSuggestion).not.toBeNull();
    expect(r.bundleSuggestion!.invoiceIds.sort()).toEqual(['inv1', 'inv2']);
  });

  it('returns empty candidates when no category and no tag is linked to a customer', async () => {
    const prisma = makePrisma({
      accounts: [{ id: 'acc1', name: 'Operating' }],
      customers: [],
      categories: [{ id: 'cat1', name: 'Misc', customerId: null }],
      transactions: [
        { id: 'tx1', accountId: 'acc1', categoryId: 'cat1', amount: new Decimal('100.00'), description: 'pmt', date: new Date('2026-01-10') },
      ],
      invoices: [],
      allocations: [],
      tags: [],
      transactionTags: [],
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
      transactions: [{ id: 'tx1', accountId: 'acc1', amount: new Decimal('300.00'), description: 'pmt', date: new Date('2026-01-10') }],
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
});

describe('PaymentsService.deleteAllocation', () => {
  function seededPaid() {
    const state: any = {
      accounts: [{ id: 'acc1', name: 'Op' }],
      customers: [{ id: 'c1', name: 'Cust' }],
      transactions: [{ id: 'tx1', accountId: 'acc1', amount: new Decimal('100.00'), description: 'pmt', date: new Date('2026-01-10') }],
      invoices: [],
      allocations: [],
      events: [],
    };
    seedInvoice(state, { id: 'i1', totalAmount: '100.00', status: 'PAID' });
    state.invoices[0].amountPaid = new Decimal('100');
    state.invoices[0].amountOutstanding = new Decimal('0');
    state.allocations.push({ id: 'a1', transactionId: 'tx1', invoiceId: 'i1', amount: new Decimal('100.00'), createdAt: new Date() });
    return state;
  }

  it('un-applying the only allocation on a PAID invoice with sendAttempts > 0 reverts to SENT', async () => {
    const state = seededPaid();
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await svc.deleteAllocation('a1');
    expect(state.invoices[0].status).toBe('SENT');
    expect(state.allocations).toHaveLength(0);
  });

  it('viewedAt stickiness — PAID + viewedAt → un-apply → VIEWED', async () => {
    const state = seededPaid();
    state.invoices[0].viewedAt = new Date('2026-01-05');
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await svc.deleteAllocation('a1');
    expect(state.invoices[0].status).toBe('VIEWED');
  });

  it('writes an AllocationEvent{DELETED} with the snapshot fields', async () => {
    const state = seededPaid();
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await svc.deleteAllocation('a1');
    const ev = state.events.find((e: any) => e.eventType === 'DELETED');
    expect(ev).toBeDefined();
    expect(ev.transactionId).toBe('tx1');
    expect(ev.invoiceId).toBe('i1');
    expect(ev.amount.toString()).toBe('100');
    expect(ev.invoiceStatusBefore).toBe('PAID');
    expect(ev.invoiceStatusAfter).toBe('SENT');
  });

  it('un-applying one of two allocations on a PAID invoice reverts to PARTIAL_PAID', async () => {
    const state = seededPaid();
    state.allocations = [
      { id: 'a1', transactionId: 'tx1', invoiceId: 'i1', amount: new Decimal('50.00'), createdAt: new Date() },
      { id: 'a2', transactionId: 'tx1', invoiceId: 'i1', amount: new Decimal('50.00'), createdAt: new Date() },
    ];
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await svc.deleteAllocation('a1');
    expect(state.invoices[0].status).toBe('PARTIAL_PAID');
    expect(state.invoices[0].amountOutstanding.toString()).toBe('50');
  });

  it('throws NotFoundException when allocation id is unknown', async () => {
    const state = seededPaid();
    const prisma = makeWritePrisma(state);
    const svc = new PaymentsService(prisma);
    await expect(svc.deleteAllocation('missing')).rejects.toThrow(/not found/i);
  });
});

describe('PaymentsService.getQueue / getQueueCount', () => {
  function baseQueueState() {
    return {
      accounts: [{ id: 'acc1', name: 'Operating' }],
      customers: [{ id: 'c1', name: 'Cust' }],
      categories: [
        { id: 'cat-inc', name: 'Sales', kind: 'INCOME', customerId: 'c1' },
        { id: 'cat-exp', name: 'Office', kind: 'EXPENSE', customerId: null },
      ],
      transactions: [
        { id: 'tx-inc', accountId: 'acc1', categoryId: 'cat-inc', amount: new Decimal('100.00'), description: 'paid', date: new Date('2026-01-10'), paymentReviewDismissedAt: null },
        { id: 'tx-exp', accountId: 'acc1', categoryId: 'cat-exp', amount: new Decimal('50.00'),  description: 'cleaning', date: new Date('2026-01-11'), paymentReviewDismissedAt: null },
        { id: 'tx-neg', accountId: 'acc1', categoryId: 'cat-inc', amount: new Decimal('-20.00'), description: 'refund', date: new Date('2026-01-12'), paymentReviewDismissedAt: null },
        { id: 'tx-dis', accountId: 'acc1', categoryId: 'cat-inc', amount: new Decimal('60.00'),  description: 'dismissed', date: new Date('2026-01-13'), paymentReviewDismissedAt: new Date() },
        { id: 'tx-full', accountId: 'acc1', categoryId: 'cat-inc', amount: new Decimal('40.00'), description: 'fully-allocated', date: new Date('2026-01-14'), paymentReviewDismissedAt: null },
      ],
      invoices: [],
      allocations: [
        { id: 'a-full', transactionId: 'tx-full', invoiceId: 'i-stub', amount: new Decimal('40.00'), createdAt: new Date() },
      ],
      events: [],
    };
  }

  function makeQueuePrisma(state: any) {
    const find = (arr: any[], where: any): any =>
      arr.find((row: any) => Object.entries(where).every(([k, v]) => row[k] === v));
    return {
      _state: state,
      transaction: {
        findMany: jest.fn(async ({ where }: any) => {
          return state.transactions
            .filter((t: any) => t.amount.gt(0))
            .filter((t: any) => where?.paymentReviewDismissedAt === null ? t.paymentReviewDismissedAt === null : true)
            .filter((t: any) => {
              if (!where?.category?.kind) return true;
              const cat = find(state.categories, { id: t.categoryId });
              return cat?.kind === where.category.kind;
            })
            .map((t: any) => {
              const cat = find(state.categories, { id: t.categoryId });
              const catCustomer = cat?.customerId ? find(state.customers, { id: cat.customerId }) : null;
              return {
                ...t,
                account: find(state.accounts, { id: t.accountId }),
                category: cat ? { customerId: cat.customerId ?? null, customer: catCustomer } : null,
                transactionTags: [],
                allocations: state.allocations.filter((a: any) => a.transactionId === t.id),
              };
            });
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const t = find(state.transactions, where)!;
          Object.assign(t, data);
          return t;
        }),
      },
    } as any;
  }

  it('default filter: positive + INCOME kind + not-dismissed + unallocated > 0', async () => {
    const state = baseQueueState();
    const svc = new PaymentsService(makeQueuePrisma(state));
    const r = await svc.getQueue({ showAll: false });
    const ids = r.map((x) => x.id);
    expect(ids).toEqual(['tx-inc']);
  });

  it('?showAll=true drops the INCOME-kind filter — still excludes negative + dismissed + fully-allocated', async () => {
    const state = baseQueueState();
    const svc = new PaymentsService(makeQueuePrisma(state));
    const r = await svc.getQueue({ showAll: true });
    const ids = r.map((x) => x.id).sort();
    expect(ids).toEqual(['tx-exp', 'tx-inc']);
  });

  it('count matches list length', async () => {
    const state = baseQueueState();
    const svc = new PaymentsService(makeQueuePrisma(state));
    const list = await svc.getQueue({ showAll: false });
    const { count } = await svc.getQueueCount({ showAll: false });
    expect(count).toBe(list.length);
  });

  it('dismiss removes from the queue', async () => {
    const state = baseQueueState();
    const svc = new PaymentsService(makeQueuePrisma(state));
    await svc.dismiss('tx-inc');
    const list = await svc.getQueue({ showAll: false });
    expect(list.map((x) => x.id)).not.toContain('tx-inc');
  });

  it('undismiss restores it', async () => {
    const state = baseQueueState();
    state.transactions[0].paymentReviewDismissedAt = new Date();
    const svc = new PaymentsService(makeQueuePrisma(state));
    await svc.undismiss('tx-inc');
    const list = await svc.getQueue({ showAll: false });
    expect(list.map((x) => x.id)).toContain('tx-inc');
  });
});

describe('PaymentsService.getCustomerCredit', () => {
  it('sums remaining across transactions linked to the customer', async () => {
    const prisma = {
      $queryRaw: jest.fn(async () => [
        { id: 't1', date: new Date('2026-01-10'), amount: new Decimal('100'), description: 'a', remaining: new Decimal('40') },
        { id: 't2', date: new Date('2026-01-12'), amount: new Decimal('200'), description: 'b', remaining: new Decimal('200') },
      ]),
    } as any;
    const svc = new PaymentsService(prisma);
    const r = await svc.getCustomerCredit('c1');
    expect(r.credit).toBe('240');
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0].remaining).toBe('40');
  });

  it('returns zero credit and empty list when query returns []', async () => {
    const prisma = { $queryRaw: jest.fn(async () => []) } as any;
    const svc = new PaymentsService(prisma);
    const r = await svc.getCustomerCredit('c1');
    expect(r.credit).toBe('0');
    expect(r.transactions).toEqual([]);
  });
});
