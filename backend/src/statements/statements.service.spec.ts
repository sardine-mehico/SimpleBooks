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
      findMany: jest.fn(async ({ where }: any) => {
        const allocs = (state.allocations ?? []).slice();
        const txs = state.transactions ?? [];
        const invs = state.invoices ?? [];
        return allocs.filter((a: any) => {
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
        }).map((a: any) => ({
          ...a,
          transaction: find(txs, { id: a.transactionId }),
        }));
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
    const svc = new StatementsService(prisma);
    const r = await svc.getStatement({
      customerId: 'cust1', billingCompanyId: 'co1',
      dateFrom: '2024-07-01', dateTo: '2025-06-30',
    });
    expect(r.openingBalance).toBe('2238.50');
  });
});
