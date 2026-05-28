import { Decimal } from '@prisma/client/runtime/library';
import { StatementsService } from './statements.service';

// Hand-rolled Prisma double. Populated per-test with the in-memory tables
// the service reads.
function makePrisma(state: {
  customers?: any[];
  billingCompanies?: any[];
  invoices?: any[];
  allocations?: any[];
  transactions?: any[];
  preferences?: any;
}) {
  const find = (arr: any[], where: any): any =>
    arr.find((row: any) => Object.entries(where).every(([k, v]) => row[k] === v));

  return {
    _state: state,
    customer: {
      findUnique: jest.fn(async ({ where }: any) =>
        find(state.customers ?? [], where) ?? null,
      ),
    },
    billingCompany: {
      findUnique: jest.fn(async ({ where }: any) =>
        find(state.billingCompanies ?? [], where) ?? null,
      ),
    },
    invoice: {
      findMany: jest.fn(async ({ where }: any) => {
        let rows = (state.invoices ?? []).slice();
        if (where?.customerId) rows = rows.filter((r: any) => r.customerId === where.customerId);
        if (where?.billingCompanyId) rows = rows.filter((r: any) => r.billingCompanyId === where.billingCompanyId);
        if (where?.status?.not) rows = rows.filter((r: any) => r.status !== where.status.not);
        if (where?.invoiceDate?.lt) rows = rows.filter((r: any) => r.invoiceDate < where.invoiceDate.lt);
        if (where?.invoiceDate?.gte) rows = rows.filter((r: any) => r.invoiceDate >= where.invoiceDate.gte);
        if (where?.invoiceDate?.lte) rows = rows.filter((r: any) => r.invoiceDate <= where.invoiceDate.lte);
        return rows;
      }),
    },
    allocation: {
      findMany: jest.fn(async ({ where, include }: any) => {
        const allocs = (state.allocations ?? []).slice();
        const txs = state.transactions ?? [];
        const invs = state.invoices ?? [];
        const filtered = allocs.filter((a: any) => {
          const tx = find(txs, { id: a.transactionId });
          const inv = find(invs, { id: a.invoiceId });
          if (!tx || !inv) return false;
          if (where?.invoice?.customerId && inv.customerId !== where.invoice.customerId) return false;
          if (where?.invoice?.billingCompanyId && inv.billingCompanyId !== where.invoice.billingCompanyId) return false;
          if (where?.invoice?.status?.not && inv.status === where.invoice.status.not) return false;
          if (where?.transaction?.date?.lt && !(tx.date < where.transaction.date.lt)) return false;
          if (where?.transaction?.date?.gte && !(tx.date >= where.transaction.date.gte)) return false;
          if (where?.transaction?.date?.lte && !(tx.date <= where.transaction.date.lte)) return false;
          return true;
        });
        if (include?.transaction) {
          return filtered.map((a: any) => ({ ...a, transaction: find(txs, { id: a.transactionId }) }));
        }
        return filtered.map((a: any) => ({ ...a }));
      }),
    },
    preferences: {
      findFirst: jest.fn(async () => state.preferences ?? { timezone: 'UTC' }),
    },
  } as any;
}

const CUSTOMER = { id: 'cust1', customerNumber: 1001, name: 'Connect Staffing Group', address: 'Osborne Park, WA', billingEmail1: 'ap@example.com', billingEmail2: null, billingCompanyId: 'co1' };
const COMPANY = { id: 'co1', name: 'Billing Co', abn: '00 000 000 000', address: null, accountsEmail: 'accounts@example.com', invoiceBcc: '', paymentDetails: null };

describe('StatementsService.getStatement', () => {
  it('computes opening balance from pre-from invoices minus pre-from payments', async () => {
    const prisma = makePrisma({
      customers: [CUSTOMER],
      billingCompanies: [COMPANY],
      invoices: [
        // Pre-from, fully paid before from -> contributes 0 to opening
        { id: 'i1', invoiceNumber: 10486, customerId: 'cust1', billingCompanyId: 'co1', status: 'PAID', totalAmount: new Decimal('1492.33'), invoiceDate: new Date('2024-05-01') },
        // Pre-from, unpaid -> contributes 2238.50 to opening
        { id: 'i2', invoiceNumber: 10400, customerId: 'cust1', billingCompanyId: 'co1', status: 'SENT', totalAmount: new Decimal('2238.50'), invoiceDate: new Date('2024-06-15') },
      ],
      transactions: [
        { id: 'tx1', date: new Date('2024-05-15') },
      ],
      allocations: [
        // Pre-from payment of i1
        { id: 'a1', transactionId: 'tx1', invoiceId: 'i1', amount: new Decimal('1492.33') },
      ],
    });
    const svc = new StatementsService(prisma, null as any, null as any);
    const r = await svc.getStatement({
      customerId: 'cust1', billingCompanyId: 'co1',
      dateFrom: '2024-07-01', dateTo: '2025-06-30',
    });
    expect(r.openingBalance).toBe('2238.50');
  });
});

describe('StatementsService.getStatement body rows', () => {
  it('emits invoice + payment rows with correct running balance', async () => {
    const prisma = makePrisma({
      customers: [CUSTOMER],
      billingCompanies: [COMPANY],
      invoices: [
        { id: 'i1', invoiceNumber: 10488, customerId: 'cust1', billingCompanyId: 'co1', status: 'SENT',
          totalAmount: new Decimal('746.16'), invoiceDate: new Date('2024-08-12') },
        { id: 'i2', invoiceNumber: 10515, customerId: 'cust1', billingCompanyId: 'co1', status: 'PAID',
          totalAmount: new Decimal('746.16'), invoiceDate: new Date('2024-09-10') },
      ],
      transactions: [
        { id: 'tx1', date: new Date('2024-09-02') },
      ],
      allocations: [
        { id: 'a1', transactionId: 'tx1', invoiceId: 'i1', amount: new Decimal('746.16') },
        { id: 'a2', transactionId: 'tx1', invoiceId: 'i2', amount: new Decimal('746.16') },
      ],
    });
    const svc = new StatementsService(prisma, null as any, null as any);
    const r = await svc.getStatement({
      customerId: 'cust1', billingCompanyId: 'co1',
      dateFrom: '2024-07-01', dateTo: '2025-06-30',
    });
    expect(r.openingBalance).toBe('0.00');
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ type: 'INVOICE', details: 'Invoice No 10488', amount: '746.16', payment: '0.00', balance: '746.16' });
    expect(r.rows[1]).toMatchObject({ type: 'PAYMENT', details: 'Payment Received $1492.32 on 02/09/2024', amount: '0.00', payment: '1492.32', balance: '-746.16' });
    expect(r.rows[2]).toMatchObject({ type: 'INVOICE', details: 'Invoice No 10515', amount: '746.16', payment: '0.00', balance: '0.00' });
    expect(r.summary).toEqual({ invoicedAmount: '1492.32', amountReceived: '1492.32', balanceDue: '0.00' });
  });

  it('places invoice before payment on same date (tiebreaker)', async () => {
    const prisma = makePrisma({
      customers: [CUSTOMER],
      billingCompanies: [COMPANY],
      invoices: [
        { id: 'i1', invoiceNumber: 100, customerId: 'cust1', billingCompanyId: 'co1', status: 'PAID',
          totalAmount: new Decimal('500.00'), invoiceDate: new Date('2024-09-10') },
      ],
      transactions: [
        { id: 'tx1', date: new Date('2024-09-10') },
      ],
      allocations: [
        { id: 'a1', transactionId: 'tx1', invoiceId: 'i1', amount: new Decimal('500.00') },
      ],
    });
    const r = await new StatementsService(prisma, null as any, null as any).getStatement({
      customerId: 'cust1', billingCompanyId: 'co1',
      dateFrom: null, dateTo: null,
    });
    expect(r.rows.map((x: any) => x.type)).toEqual(['INVOICE', 'PAYMENT']);
  });

  it('excludes VOID invoices from rows AND payment-row sums', async () => {
    const prisma = makePrisma({
      customers: [CUSTOMER],
      billingCompanies: [COMPANY],
      invoices: [
        { id: 'i1', invoiceNumber: 200, customerId: 'cust1', billingCompanyId: 'co1', status: 'VOID',
          totalAmount: new Decimal('999.00'), invoiceDate: new Date('2024-09-10') },
        { id: 'i2', invoiceNumber: 201, customerId: 'cust1', billingCompanyId: 'co1', status: 'PAID',
          totalAmount: new Decimal('100.00'), invoiceDate: new Date('2024-09-15') },
      ],
      transactions: [
        { id: 'tx1', date: new Date('2024-09-16') },
      ],
      allocations: [
        { id: 'aV', transactionId: 'tx1', invoiceId: 'i1', amount: new Decimal('999.00') },
        { id: 'a2', transactionId: 'tx1', invoiceId: 'i2', amount: new Decimal('100.00') },
      ],
    });
    const r = await new StatementsService(prisma, null as any, null as any).getStatement({
      customerId: 'cust1', billingCompanyId: 'co1',
      dateFrom: null, dateTo: null,
    });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ type: 'INVOICE', details: 'Invoice No 201' });
    expect(r.rows[1]).toMatchObject({ type: 'PAYMENT', payment: '100.00' });
  });

  it('uses null bounds as "all time" (no filter, openingBalance = 0)', async () => {
    const prisma = makePrisma({
      customers: [CUSTOMER],
      billingCompanies: [COMPANY],
      invoices: [
        { id: 'i1', invoiceNumber: 1, customerId: 'cust1', billingCompanyId: 'co1', status: 'SENT',
          totalAmount: new Decimal('50.00'), invoiceDate: new Date('2020-01-01') },
      ],
    });
    const r = await new StatementsService(prisma, null as any, null as any).getStatement({
      customerId: 'cust1', billingCompanyId: 'co1',
      dateFrom: null, dateTo: null,
    });
    expect(r.openingBalance).toBe('0.00');
    expect(r.rows).toHaveLength(1);
  });
});
