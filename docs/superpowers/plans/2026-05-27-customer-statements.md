# Customer Statements (Phase E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/statements` page that renders an on-screen Customer Statement (Customer + Billing Company + optional date range), with PDF download and email-send actions. Statement math is computed server-side from `Invoice` + `Allocation` + `Transaction`; no schema changes.

**Architecture:** New `StatementsModule` (Nest) with a pure service that computes opening balance + body rows + summary from Prisma data; a new React-PDF template that mirrors the supplied sample; an extension to `MailService` for `sendStatement`; a new client page mirroring the Reports pattern with a Send dialog mirroring Send-Invoice.

**Tech Stack:** NestJS 10 + Prisma + `@prisma/client/runtime/library` Decimal · React-PDF for PDF rendering · nodemailer (via existing `MailService`) for email · Next.js 15 App Router + Tailwind + lucide-react for UI · Jest for tests.

**Spec:** [`docs/superpowers/specs/2026-05-27-customer-statements-design.md`](../specs/2026-05-27-customer-statements-design.md)

---

## Important conventions to follow

1. **Decimal arithmetic** — Use `Decimal` from `@prisma/client/runtime/library` for all money math. Never `Number()` partial sums. The final JSON payload converts each `Decimal` to its `.toFixed(2)` string. (Same pattern as `PaymentsService`.)
2. **Date helpers** — Date-range filters MUST use `localStartOfDay` / `localEndOfDay` from `backend/src/util/dates.ts` to avoid the `Australia/Perth +08:00` off-by-one UTC trap. Look up `Preferences.timezone` (singleton row, default `Australia/Perth`) via `prisma.preferences.findFirst()`.
3. **VOIDs** — VOID invoices are excluded from opening balance, body rows, AND payment-row amount sums. Single source of truth: every Prisma query filters `status: { not: 'VOID' }`.
4. **Backend tests** — Hand-rolled in-memory Prisma double, NOT a real DB. Mirror the pattern in `backend/src/payments/payments.service.spec.ts`. Each spec file lives next to its source (`statements.service.spec.ts` etc).
5. **JSX in backend** — `backend/tsconfig.json` already enables `"jsx": "react"`; templates use `.tsx`.
6. **Tone** — No emojis in any file, comments, commit messages, or chat. Concise commit messages.
7. **Docs** — Update `modules_and_logic.md` and `Architecture.md` in the final task. **Do not** touch `DatabaseSchema.md` (Phase E is fully additive) or `DesignSystem.md` (no new tokens).
8. **Commit per task** — Each task ends with a single commit. Use the message provided in Step "Commit".

---

## File Structure

### Backend — new files
- `backend/src/statements/statements.module.ts` — Nest module
- `backend/src/statements/statements.controller.ts` — 4 endpoints
- `backend/src/statements/statements.service.ts` — `getStatement`, `getSendContext`, `formatPaymentDetails`
- `backend/src/statements/dto.ts` — query + send DTOs
- `backend/src/statements/types.ts` — `StatementResponse`, `StatementRow`, `StatementSendContext`
- `backend/src/statements/statements.service.spec.ts` — unit tests for math
- `backend/src/pdf/templates/customer-statement.tsx` — React-PDF statement template

### Backend — modified files
- `backend/src/pdf/templates/types.ts` — add `PdfStatement*` types
- `backend/src/pdf/pdf.service.ts` — add `renderStatement(payload)`
- `backend/src/mail/mail.service.ts` — add `sendStatement(payload, overrides)` + `SendStatementOverrides` type
- `backend/src/mail/mail.module.ts` — no changes (already exports `MailService`)
- `backend/src/app.module.ts` — register `StatementsModule`

### Frontend — new files
- `frontend/components/statements/statements-page.tsx` — client page
- `frontend/components/statements/send-statement-dialog.tsx` — Send dialog
- `frontend/lib/statements.ts` — API helpers

### Frontend — modified files
- `frontend/app/statements/page.tsx` — replace `ComingSoon` with real server component
- `frontend/lib/types.ts` — add `StatementResponse`, `StatementRow`, `StatementSendContext`

### Docs — modified files
- `modules_and_logic.md` — add Statements section under Reports
- `Architecture.md` — add `statements` module summary

---

## Task 1: Backend — types + DTOs

**Files:**
- Create: `backend/src/statements/types.ts`
- Create: `backend/src/statements/dto.ts`

- [ ] **Step 1: Write the types file**

Create `backend/src/statements/types.ts`:

```ts
// Shape returned by GET /statements. Numbers are Decimal-as-string
// (`.toFixed(2)`) per the existing convention — the frontend wraps in
// Number(...) for display math.

export type StatementRowType = 'INVOICE' | 'PAYMENT';

export type StatementRow = {
  date: string;            // YYYY-MM-DD (the row's transaction-or-invoice date)
  type: StatementRowType;
  details: string;         // e.g. "Invoice No 10488" / "Payment Received $746.16 on 02/09/2024"
  amount: string;          // "0.00" when type === 'PAYMENT'
  payment: string;         // "0.00" when type === 'INVOICE'
  balance: string;
};

export type StatementResponse = {
  customer: {
    id: string;
    customerNumber: number;
    name: string;
    address: string | null;
    billingEmail1: string | null;
    billingEmail2: string | null;
  };
  billingCompany: {
    id: string;
    name: string;
    abn: string | null;
    address: string | null;
    accountsEmail: string | null;
    invoiceBcc: string;
    paymentDetails: string | null;
  };
  dateFrom: string | null;   // YYYY-MM-DD or null (= "all time" lower bound)
  dateTo: string | null;     // YYYY-MM-DD or null (= "all time" upper bound)
  openingBalance: string;
  rows: StatementRow[];
  summary: {
    invoicedAmount: string;
    amountReceived: string;
    balanceDue: string;
  };
};

export type StatementSendContext = {
  from: string;   // billingCompany.accountsEmail
  to: string;     // customer.billingEmail1
  cc: string;     // customer.billingEmail2 or ''
  bcc: string;   // billingCompany.invoiceBcc or ''
  subject: string;
  html: string;
};
```

- [ ] **Step 2: Write the DTO file**

Create `backend/src/statements/dto.ts`:

```ts
import { IsDateString, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class StatementQueryDto {
  @IsUUID() customerId!: string;
  @IsUUID() billingCompanyId!: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class SendStatementDto {
  @IsUUID() customerId!: string;
  @IsUUID() billingCompanyId!: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;

  // The Send dialog's editable fields. All required at send time.
  @IsEmail() fromEmail!: string;
  @IsEmail() toEmail!: string;
  @IsOptional() @IsString() ccEmail?: string;
  @IsOptional() @IsString() bccEmail?: string;
  @IsString() @MinLength(1) @MaxLength(255) subject!: string;
  @IsString() html!: string;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `docker compose exec backend sh -c "cd /app && npx tsc --noEmit -p tsconfig.json"`
Expected: no errors mentioning `backend/src/statements/`.

(If the backend container isn't running, skip this — TS errors will surface in Task 5's spec run.)

- [ ] **Step 4: Commit**

```bash
git add backend/src/statements/types.ts backend/src/statements/dto.ts
git commit -m "feat(statements): types and DTOs"
```

---

## Task 2: Backend — service skeleton + opening-balance test (failing)

**Files:**
- Create: `backend/src/statements/statements.service.ts`
- Create: `backend/src/statements/statements.service.spec.ts`

- [ ] **Step 1: Write the failing test for opening balance**

Create `backend/src/statements/statements.service.spec.ts`:

```ts
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
```

- [ ] **Step 2: Write a minimal service that throws (so the test compiles + fails for the right reason)**

Create `backend/src/statements/statements.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { localStartOfDay, localEndOfDay } from '../util/dates';
import type { StatementResponse, StatementRow } from './types';

type GetParams = {
  customerId: string;
  billingCompanyId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
};

@Injectable()
export class StatementsService {
  constructor(private prisma: PrismaService) {}

  async getStatement(params: GetParams): Promise<StatementResponse> {
    const { customerId, billingCompanyId } = params;
    const dateFrom = params.dateFrom ?? null;
    const dateTo = params.dateTo ?? null;

    const [customer, billingCompany, prefs] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.billingCompany.findUnique({ where: { id: billingCompanyId } }),
      this.prisma.preferences.findFirst(),
    ]);
    if (!customer) throw new NotFoundException('Customer not found');
    if (!billingCompany) throw new NotFoundException('Billing company not found');
    const tz = prefs?.timezone ?? 'Australia/Perth';

    const fromInstant = dateFrom ? localStartOfDay(dateFrom, tz) : null;
    const toInstant = dateTo ? localEndOfDay(dateTo, tz) : null;

    const openingBalance = await this.computeOpeningBalance({
      customerId, billingCompanyId, fromInstant,
    });

    // Body rows + running balance — Task 3 wires this up.
    const rows: StatementRow[] = [];
    const invoicedAmount = new Decimal('0');
    const amountReceived = new Decimal('0');
    const balanceDue = openingBalance.add(invoicedAmount).sub(amountReceived);

    return {
      customer: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        address: customer.address ?? null,
        billingEmail1: customer.billingEmail1 ?? null,
        billingEmail2: customer.billingEmail2 ?? null,
      },
      billingCompany: {
        id: billingCompany.id,
        name: billingCompany.name,
        abn: billingCompany.abn ?? null,
        address: billingCompany.address ?? null,
        accountsEmail: billingCompany.accountsEmail ?? null,
        invoiceBcc: billingCompany.invoiceBcc ?? '',
        paymentDetails: billingCompany.paymentDetails ?? null,
      },
      dateFrom,
      dateTo,
      openingBalance: openingBalance.toFixed(2),
      rows,
      summary: {
        invoicedAmount: invoicedAmount.toFixed(2),
        amountReceived: amountReceived.toFixed(2),
        balanceDue: balanceDue.toFixed(2),
      },
    };
  }

  private async computeOpeningBalance(params: {
    customerId: string;
    billingCompanyId: string;
    fromInstant: Date | null;
  }): Promise<Decimal> {
    if (!params.fromInstant) return new Decimal('0');

    const preInvoices = await this.prisma.invoice.findMany({
      where: {
        customerId: params.customerId,
        billingCompanyId: params.billingCompanyId,
        status: { not: 'VOID' as any },
        invoiceDate: { lt: params.fromInstant },
      },
    });
    const invoicedPre = preInvoices.reduce(
      (acc: Decimal, inv: any) => acc.add(new Decimal(inv.totalAmount.toString())),
      new Decimal('0'),
    );

    const preAllocs = await this.prisma.allocation.findMany({
      where: {
        invoice: {
          customerId: params.customerId,
          billingCompanyId: params.billingCompanyId,
          status: { not: 'VOID' as any },
        },
        transaction: { date: { lt: params.fromInstant } },
      },
    });
    const paidPre = preAllocs.reduce(
      (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
      new Decimal('0'),
    );

    return invoicedPre.sub(paidPre);
  }
}
```

- [ ] **Step 3: Run the test to confirm it passes**

Run: `docker compose exec backend sh -c "cd /app && npx jest src/statements/statements.service.spec.ts --runTestsByPath -t opening"`
Expected: 1 test passes (`computes opening balance from pre-from invoices minus pre-from payments`).

If the backend container isn't running, run `docker compose up -d backend` first; if jest isn't installed inside the container, you can also run from outside the container with `docker compose run --rm backend npx jest ...`. Tests for this module never hit a real DB.

- [ ] **Step 4: Commit**

```bash
git add backend/src/statements/statements.service.ts backend/src/statements/statements.service.spec.ts
git commit -m "feat(statements): service skeleton + opening balance"
```

---

## Task 3: Backend — body rows + running balance + summary

**Files:**
- Modify: `backend/src/statements/statements.service.ts`
- Modify: `backend/src/statements/statements.service.spec.ts`

- [ ] **Step 1: Add a failing test for body rows + running balance**

Append to `backend/src/statements/statements.service.spec.ts`:

```ts
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
        { id: 'tx1', date: new Date('2024-09-02') },   // payment row
      ],
      allocations: [
        { id: 'a1', transactionId: 'tx1', invoiceId: 'i1', amount: new Decimal('746.16') },
        { id: 'a2', transactionId: 'tx1', invoiceId: 'i2', amount: new Decimal('746.16') },
      ],
    });
    const svc = new StatementsService(prisma);
    const r = await svc.getStatement({
      customerId: 'cust1', billingCompanyId: 'co1',
      dateFrom: '2024-07-01', dateTo: '2025-06-30',
    });
    expect(r.openingBalance).toBe('0.00');
    expect(r.rows).toHaveLength(3);
    // Sort: 2024-08-12 (invoice), 2024-09-02 (payment), 2024-09-10 (invoice)
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
    const r = await new StatementsService(prisma).getStatement({
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
        { id: 'aV', transactionId: 'tx1', invoiceId: 'i1', amount: new Decimal('999.00') },  // allocation to VOID, must be ignored
        { id: 'a2', transactionId: 'tx1', invoiceId: 'i2', amount: new Decimal('100.00') },
      ],
    });
    const r = await new StatementsService(prisma).getStatement({
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
    const r = await new StatementsService(prisma).getStatement({
      customerId: 'cust1', billingCompanyId: 'co1',
      dateFrom: null, dateTo: null,
    });
    expect(r.openingBalance).toBe('0.00');
    expect(r.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement body-row generation + running balance**

Replace the placeholder section in `backend/src/statements/statements.service.ts` (the part that builds `rows`, `invoicedAmount`, `amountReceived`, and `balanceDue`). The final file:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { localStartOfDay, localEndOfDay } from '../util/dates';
import type { StatementResponse, StatementRow } from './types';

type GetParams = {
  customerId: string;
  billingCompanyId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
};

function fmtDateLocal(d: Date): string {
  // YYYY-MM-DD using local calendar parts (timezone of the running process).
  // Sufficient here because the spec column shows the row's "calendar date"
  // independent of the user's tz — and DB Date columns carry no time-of-day
  // info beyond what was inserted.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDdMmYyyy(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}

@Injectable()
export class StatementsService {
  constructor(private prisma: PrismaService) {}

  async getStatement(params: GetParams): Promise<StatementResponse> {
    const { customerId, billingCompanyId } = params;
    const dateFrom = params.dateFrom ?? null;
    const dateTo = params.dateTo ?? null;

    const [customer, billingCompany, prefs] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.billingCompany.findUnique({ where: { id: billingCompanyId } }),
      this.prisma.preferences.findFirst(),
    ]);
    if (!customer) throw new NotFoundException('Customer not found');
    if (!billingCompany) throw new NotFoundException('Billing company not found');
    const tz = prefs?.timezone ?? 'Australia/Perth';

    const fromInstant = dateFrom ? localStartOfDay(dateFrom, tz) : null;
    const toInstant = dateTo ? localEndOfDay(dateTo, tz) : null;

    const openingBalance = await this.computeOpeningBalance({
      customerId, billingCompanyId, fromInstant,
    });

    // --- Body invoice rows ---
    const bodyInvoiceWhere: any = {
      customerId,
      billingCompanyId,
      status: { not: 'VOID' },
    };
    if (fromInstant || toInstant) {
      bodyInvoiceWhere.invoiceDate = {};
      if (fromInstant) bodyInvoiceWhere.invoiceDate.gte = fromInstant;
      if (toInstant) bodyInvoiceWhere.invoiceDate.lte = toInstant;
    }
    const bodyInvoices = await this.prisma.invoice.findMany({ where: bodyInvoiceWhere });

    // --- Body payment rows ---
    // Fetch every allocation that links a (this scope, non-VOID) invoice to a
    // transaction whose date sits in [from, to]. Group by transactionId in TS.
    const bodyAllocWhere: any = {
      invoice: {
        customerId,
        billingCompanyId,
        status: { not: 'VOID' },
      },
    };
    if (fromInstant || toInstant) {
      bodyAllocWhere.transaction = { date: {} };
      if (fromInstant) bodyAllocWhere.transaction.date.gte = fromInstant;
      if (toInstant) bodyAllocWhere.transaction.date.lte = toInstant;
    }
    const bodyAllocs = await this.prisma.allocation.findMany({ where: bodyAllocWhere });

    type TxBucket = { transactionId: string; date: Date; payment: Decimal };
    const txBuckets = new Map<string, TxBucket>();
    for (const a of bodyAllocs as any[]) {
      const tx = a.transaction;
      if (!tx) continue;
      const bucket = txBuckets.get(a.transactionId) ?? {
        transactionId: a.transactionId,
        date: tx.date,
        payment: new Decimal('0'),
      };
      bucket.payment = bucket.payment.add(new Decimal(a.amount.toString()));
      txBuckets.set(a.transactionId, bucket);
    }

    // --- Merge + sort ---
    type Sortable =
      | { kind: 'INVOICE'; date: Date; tieKey: number; invoiceNumber: number; total: Decimal }
      | { kind: 'PAYMENT'; date: Date; tieKey: number; transactionId: string; payment: Decimal };

    const merged: Sortable[] = [
      ...bodyInvoices.map((inv: any): Sortable => ({
        kind: 'INVOICE',
        date: inv.invoiceDate,
        tieKey: 0,           // invoices sort first on same date
        invoiceNumber: inv.invoiceNumber,
        total: new Decimal(inv.totalAmount.toString()),
      })),
      ...Array.from(txBuckets.values()).map((b): Sortable => ({
        kind: 'PAYMENT',
        date: b.date,
        tieKey: 1,           // payments sort second on same date
        transactionId: b.transactionId,
        payment: b.payment,
      })),
    ];
    merged.sort((a, b) => {
      const dt = a.date.getTime() - b.date.getTime();
      if (dt !== 0) return dt;
      if (a.tieKey !== b.tieKey) return a.tieKey - b.tieKey;
      if (a.kind === 'INVOICE' && b.kind === 'INVOICE') {
        return a.invoiceNumber - b.invoiceNumber;
      }
      if (a.kind === 'PAYMENT' && b.kind === 'PAYMENT') {
        return a.transactionId.localeCompare(b.transactionId);
      }
      return 0;
    });

    // --- Walk rows, compute running balance + summary ---
    let running = openingBalance;
    let invoicedAmount = new Decimal('0');
    let amountReceived = new Decimal('0');
    const rows: StatementRow[] = merged.map((m) => {
      if (m.kind === 'INVOICE') {
        running = running.add(m.total);
        invoicedAmount = invoicedAmount.add(m.total);
        return {
          date: fmtDateLocal(m.date),
          type: 'INVOICE',
          details: `Invoice No ${m.invoiceNumber}`,
          amount: m.total.toFixed(2),
          payment: '0.00',
          balance: running.toFixed(2),
        };
      } else {
        running = running.sub(m.payment);
        amountReceived = amountReceived.add(m.payment);
        return {
          date: fmtDateLocal(m.date),
          type: 'PAYMENT',
          details: `Payment Received $${m.payment.toFixed(2)} on ${fmtDdMmYyyy(m.date)}`,
          amount: '0.00',
          payment: m.payment.toFixed(2),
          balance: running.toFixed(2),
        };
      }
    });

    const balanceDue = openingBalance.add(invoicedAmount).sub(amountReceived);

    return {
      customer: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        address: customer.address ?? null,
        billingEmail1: customer.billingEmail1 ?? null,
        billingEmail2: customer.billingEmail2 ?? null,
      },
      billingCompany: {
        id: billingCompany.id,
        name: billingCompany.name,
        abn: billingCompany.abn ?? null,
        address: billingCompany.address ?? null,
        accountsEmail: billingCompany.accountsEmail ?? null,
        invoiceBcc: billingCompany.invoiceBcc ?? '',
        paymentDetails: billingCompany.paymentDetails ?? null,
      },
      dateFrom,
      dateTo,
      openingBalance: openingBalance.toFixed(2),
      rows,
      summary: {
        invoicedAmount: invoicedAmount.toFixed(2),
        amountReceived: amountReceived.toFixed(2),
        balanceDue: balanceDue.toFixed(2),
      },
    };
  }

  private async computeOpeningBalance(params: {
    customerId: string;
    billingCompanyId: string;
    fromInstant: Date | null;
  }): Promise<Decimal> {
    if (!params.fromInstant) return new Decimal('0');

    const preInvoices = await this.prisma.invoice.findMany({
      where: {
        customerId: params.customerId,
        billingCompanyId: params.billingCompanyId,
        status: { not: 'VOID' as any },
        invoiceDate: { lt: params.fromInstant },
      },
    });
    const invoicedPre = preInvoices.reduce(
      (acc: Decimal, inv: any) => acc.add(new Decimal(inv.totalAmount.toString())),
      new Decimal('0'),
    );

    const preAllocs = await this.prisma.allocation.findMany({
      where: {
        invoice: {
          customerId: params.customerId,
          billingCompanyId: params.billingCompanyId,
          status: { not: 'VOID' as any },
        },
        transaction: { date: { lt: params.fromInstant } },
      },
    });
    const paidPre = preAllocs.reduce(
      (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
      new Decimal('0'),
    );

    return invoicedPre.sub(paidPre);
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `docker compose exec backend sh -c "cd /app && npx jest src/statements/statements.service.spec.ts --runTestsByPath"`
Expected: all 5 tests pass (opening balance + 4 body-row cases).

- [ ] **Step 4: Commit**

```bash
git add backend/src/statements/statements.service.ts backend/src/statements/statements.service.spec.ts
git commit -m "feat(statements): body rows, running balance, summary"
```

---

## Task 4: Backend — module, controller, app wiring (JSON endpoint only)

**Files:**
- Create: `backend/src/statements/statements.controller.ts`
- Create: `backend/src/statements/statements.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write the controller (JSON endpoint only — PDF + send come later)**

Create `backend/src/statements/statements.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { StatementsService } from './statements.service';
import { StatementQueryDto } from './dto';

@Controller('statements')
export class StatementsController {
  constructor(private statements: StatementsService) {}

  @Get()
  get(@Query() q: StatementQueryDto) {
    return this.statements.getStatement({
      customerId: q.customerId,
      billingCompanyId: q.billingCompanyId,
      dateFrom: q.dateFrom ?? null,
      dateTo: q.dateTo ?? null,
    });
  }
}
```

- [ ] **Step 2: Write the module**

Create `backend/src/statements/statements.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfModule } from '../pdf/pdf.module';
import { MailModule } from '../mail/mail.module';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';

@Module({
  imports: [PrismaModule, PdfModule, MailModule],
  controllers: [StatementsController],
  providers: [StatementsService],
  exports: [StatementsService],
})
export class StatementsModule {}
```

- [ ] **Step 3: Register the module in `app.module.ts`**

In `backend/src/app.module.ts`:

Add to the imports list near `ReportsModule`:

```ts
import { StatementsModule } from './statements/statements.module';
```

And in the `@Module({ imports: [...] })` array, add `StatementsModule` next to `ReportsModule`.

- [ ] **Step 4: Rebuild and verify the endpoint responds**

Run: `docker compose build backend && docker compose up -d backend`

Wait ~60 seconds for Prisma client regen + Nest boot, then:

```bash
docker logs simplebooks-backend-1 --tail 50
```

Expected: log lines indicating `StatementsModule dependencies initialized` and `Mapped {/statements, GET}`. No errors.

Smoke test against a seeded customer:

```bash
CUST_ID=$(docker compose exec -T postgres psql -U postgres -d simplebooks -tA -c "SELECT id FROM \"Customer\" LIMIT 1;")
CO_ID=$(docker compose exec -T postgres psql -U postgres -d simplebooks -tA -c "SELECT \"billingCompanyId\" FROM \"Customer\" WHERE id='$CUST_ID';")
curl -s "http://localhost:4000/statements?customerId=$CUST_ID&billingCompanyId=$CO_ID" | head -c 500
```

Expected: JSON starting with `{"customer":{"id":...`. If empty, the seed may not have invoices for that pair — try a different customer or note the empty rows array (still a valid response).

- [ ] **Step 5: Commit**

```bash
git add backend/src/statements/statements.controller.ts backend/src/statements/statements.module.ts backend/src/app.module.ts
git commit -m "feat(statements): module + GET /statements endpoint"
```

---

## Task 5: PDF — types + template skeleton

**Files:**
- Modify: `backend/src/pdf/templates/types.ts`
- Create: `backend/src/pdf/templates/customer-statement.tsx`

- [ ] **Step 1: Add PDF statement types**

At the end of `backend/src/pdf/templates/types.ts`, append:

```ts
// === Statement template ===

export type PdfStatementRow = {
  date: string;            // YYYY-MM-DD
  type: 'INVOICE' | 'PAYMENT';
  details: string;
  amount: string;          // "0.00" when type === PAYMENT
  payment: string;         // "0.00" when type === INVOICE
  balance: string;
};

export type PdfStatementPayload = {
  customer: {
    customerNumber: number;
    name: string;
    address: string | null;
    billingEmail1: string | null;
  };
  billingCompany: {
    name: string;
    abn: string | null;
    address: string | null;
    accountsEmail: string | null;
  };
  dateFrom: string | null;   // YYYY-MM-DD
  dateTo: string | null;
  openingBalance: string;    // "2238.50"
  rows: PdfStatementRow[];
  summary: {
    invoicedAmount: string;
    amountReceived: string;
    balanceDue: string;
  };
};

export type PdfStatementTemplateProps = {
  statement: PdfStatementPayload;
};
```

- [ ] **Step 2: Write the React-PDF statement template**

Create `backend/src/pdf/templates/customer-statement.tsx`:

```tsx
import * as React from 'react';
import * as path from 'path';
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PdfStatementTemplateProps } from './types';

// Reuse Source Sans 3 (already installed; used by other templates).
const SS3_DIR =
  path.dirname(require.resolve('@fontsource/source-sans-3/package.json')) + '/files';
Font.register({
  family: 'Source Sans 3',
  fonts: [
    { src: `${SS3_DIR}/source-sans-3-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${SS3_DIR}/source-sans-3-latin-600-normal.woff`, fontWeight: 600 },
    { src: `${SS3_DIR}/source-sans-3-latin-700-normal.woff`, fontWeight: 700 },
  ],
});

const COLOR = {
  ink: '#1a1a1a',
  inkSoft: '#4a4a4a',
  divider: '#d0d4dc',
  headerBg: '#374151',
  headerText: '#ffffff',
  summaryBg: '#f3f4f6',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Source Sans 3',
    fontSize: 9.5,
    color: COLOR.ink,
    paddingTop: 30,
    paddingBottom: 30,
    paddingLeft: 36,
    paddingRight: 36,
    flexDirection: 'column',
  },

  // Top — billing company on the right
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 24 },
  companyBlock: { textAlign: 'right' },
  companyName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  companyLine: { fontSize: 9, color: COLOR.inkSoft, marginBottom: 1 },

  // "To" customer block on the left, "Statement of Accounts" title on the right
  middleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  toBlock: { maxWidth: '55%' },
  toLabel: { fontSize: 10, fontWeight: 700, marginBottom: 4 },
  toName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  toLine: { fontSize: 9.5, color: COLOR.inkSoft, lineHeight: 1.4 },

  titleBlock: { maxWidth: '45%', alignItems: 'flex-end' },
  titleText: { fontSize: 22, fontWeight: 700, marginBottom: 2 },
  titleRange: { fontSize: 9, color: COLOR.inkSoft, borderTopWidth: 1, borderTopColor: COLOR.ink, paddingTop: 2, alignSelf: 'flex-end' },

  // Summary card (4 rows)
  summary: { backgroundColor: COLOR.summaryBg, padding: 10, borderRadius: 4, marginBottom: 18, alignSelf: 'flex-end', width: 240 },
  summaryHeading: { fontSize: 10, fontWeight: 700, marginBottom: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, fontSize: 10 },
  summaryRowLabel: { color: COLOR.inkSoft },
  summaryRowValue: {},

  // Table
  table: { marginTop: 4 },
  thead: {
    flexDirection: 'row',
    backgroundColor: COLOR.headerBg,
    color: COLOR.headerText,
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 9,
    fontWeight: 700,
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.divider,
    fontSize: 9.5,
  },

  // Column widths must sum to 100%.
  colDate:        { width: '12%' },
  colType:        { width: '12%' },
  colDetails:     { width: '34%' },
  colAmount:      { width: '14%', textAlign: 'right' },
  colPayment:     { width: '14%', textAlign: 'right' },
  colBalance:     { width: '14%', textAlign: 'right' },

  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14, fontSize: 10, fontWeight: 700 },
  footerLabel: { marginRight: 14 },
});

function formatRange(dateFrom: string | null, dateTo: string | null): string {
  const f = dateFrom ? toDdMmYyyy(dateFrom) : null;
  const t = dateTo ? toDdMmYyyy(dateTo) : null;
  if (!f && !t) return 'All transactions';
  if (f && t) return `${f} To ${t}`;
  if (f) return `From ${f}`;
  return `To ${t}`;
}

function toDdMmYyyy(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${y}`;
}

function typeLabel(t: 'INVOICE' | 'PAYMENT'): string {
  return t === 'INVOICE' ? 'Invoice' : 'Payment Received';
}

export default function CustomerStatementTemplate({ statement }: PdfStatementTemplateProps) {
  const { customer, billingCompany, dateFrom, dateTo, openingBalance, rows, summary } = statement;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topRow}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{billingCompany.name}</Text>
            {billingCompany.abn ? <Text style={styles.companyLine}>ABN {billingCompany.abn}</Text> : null}
            {billingCompany.accountsEmail ? <Text style={styles.companyLine}>{billingCompany.accountsEmail}</Text> : null}
          </View>
        </View>

        <View style={styles.middleRow}>
          <View style={styles.toBlock}>
            <Text style={styles.toLabel}>To</Text>
            <Text style={styles.toName}>{customer.name}</Text>
            {customer.address ? <Text style={styles.toLine}>{customer.address}</Text> : null}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.titleText}>Statement of Accounts</Text>
            <Text style={styles.titleRange}>{formatRange(dateFrom, dateTo)}</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryHeading}>Account Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>Opening Balance</Text>
            <Text style={styles.summaryRowValue}>${openingBalance}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>Invoiced Amount</Text>
            <Text style={styles.summaryRowValue}>${summary.invoicedAmount}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>Amount Received</Text>
            <Text style={styles.summaryRowValue}>${summary.amountReceived}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>Balance Due</Text>
            <Text style={styles.summaryRowValue}>${summary.balanceDue}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={styles.colDate}>Date</Text>
            <Text style={styles.colType}>Transactions</Text>
            <Text style={styles.colDetails}>Details</Text>
            <Text style={styles.colAmount}>Amount</Text>
            <Text style={styles.colPayment}>Payments</Text>
            <Text style={styles.colBalance}>Balance</Text>
          </View>

          {dateFrom ? (
            <View style={styles.tr}>
              <Text style={styles.colDate}>{toDdMmYyyy(dateFrom)}</Text>
              <Text style={styles.colType}>Opening</Text>
              <Text style={styles.colDetails}>***Opening Balance***</Text>
              <Text style={styles.colAmount}>{openingBalance}</Text>
              <Text style={styles.colPayment}>{''}</Text>
              <Text style={styles.colBalance}>{openingBalance}</Text>
            </View>
          ) : null}

          {rows.map((r, i) => (
            <View key={i} style={styles.tr}>
              <Text style={styles.colDate}>{toDdMmYyyy(r.date)}</Text>
              <Text style={styles.colType}>{typeLabel(r.type)}</Text>
              <Text style={styles.colDetails}>{r.details}</Text>
              <Text style={styles.colAmount}>{r.type === 'INVOICE' ? r.amount : ''}</Text>
              <Text style={styles.colPayment}>{r.type === 'PAYMENT' ? r.payment : ''}</Text>
              <Text style={styles.colBalance}>{r.balance}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLabel}>Balance Due</Text>
          <Text>${summary.balanceDue}</Text>
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `docker compose exec backend sh -c "cd /app && npx tsc --noEmit -p tsconfig.json"`
Expected: no errors mentioning `customer-statement.tsx` or `types.ts`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/pdf/templates/types.ts backend/src/pdf/templates/customer-statement.tsx
git commit -m "feat(statements/pdf): React-PDF statement template"
```

---

## Task 6: PdfService.renderStatement + GET /statements/pdf endpoint

**Files:**
- Modify: `backend/src/pdf/pdf.service.ts`
- Modify: `backend/src/statements/statements.controller.ts`

- [ ] **Step 1: Add renderStatement to PdfService**

In `backend/src/pdf/pdf.service.ts`, add a method below `renderInvoice`. The full file's `import` block needs `CustomerStatementTemplate` and `PdfStatementPayload`:

At the top of the file, near the other template imports, add:

```ts
import CustomerStatementTemplate from './templates/customer-statement';
import type { PdfStatementPayload } from './templates/types';
```

Then add this method to the `PdfService` class (after `renderInvoice`):

```ts
async renderStatement(payload: PdfStatementPayload): Promise<{ buffer: Buffer; filename: string }> {
  const element = React.createElement(CustomerStatementTemplate, { statement: payload });
  const buffer = await renderToBuffer(element as React.ReactElement);

  const pageCount = countPdfPages(buffer);
  const bytesPerPage = buffer.byteLength / Math.max(pageCount, 1);
  if (bytesPerPage > SIZE_BUDGET_BYTES_PER_PAGE) {
    this.log.warn(
      `Statement (cust ${payload.customer.customerNumber}) rendered to ${buffer.byteLength}B across ${pageCount} page(s) — ${Math.round(bytesPerPage / 1024)}KB/page exceeds 180KB target.`,
    );
  }

  const from = payload.dateFrom ?? 'all';
  const to = payload.dateTo ?? 'all';
  const filename = `Statement-${payload.customer.customerNumber}-${from}-${to}.pdf`;
  return { buffer, filename };
}
```

- [ ] **Step 2: Wire `GET /statements/pdf` in the controller**

Update `backend/src/statements/statements.controller.ts`:

```ts
import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StatementsService } from './statements.service';
import { PdfService } from '../pdf/pdf.service';
import { StatementQueryDto } from './dto';

@Controller('statements')
export class StatementsController {
  constructor(
    private statements: StatementsService,
    private pdf: PdfService,
  ) {}

  @Get()
  get(@Query() q: StatementQueryDto) {
    return this.statements.getStatement({
      customerId: q.customerId,
      billingCompanyId: q.billingCompanyId,
      dateFrom: q.dateFrom ?? null,
      dateTo: q.dateTo ?? null,
    });
  }

  @Get('pdf')
  @Header('Content-Type', 'application/pdf')
  async renderPdf(@Query() q: StatementQueryDto, @Res() res: Response) {
    const payload = await this.statements.getStatement({
      customerId: q.customerId,
      billingCompanyId: q.billingCompanyId,
      dateFrom: q.dateFrom ?? null,
      dateTo: q.dateTo ?? null,
    });
    const { buffer, filename } = await this.pdf.renderStatement({
      customer: {
        customerNumber: payload.customer.customerNumber,
        name: payload.customer.name,
        address: payload.customer.address,
        billingEmail1: payload.customer.billingEmail1,
      },
      billingCompany: {
        name: payload.billingCompany.name,
        abn: payload.billingCompany.abn,
        address: payload.billingCompany.address,
        accountsEmail: payload.billingCompany.accountsEmail,
      },
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      openingBalance: payload.openingBalance,
      rows: payload.rows,
      summary: payload.summary,
    });
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.end(buffer);
  }
}
```

- [ ] **Step 3: Rebuild and smoke-test**

```bash
docker compose build backend && docker compose up -d backend
sleep 60
docker logs simplebooks-backend-1 --tail 20
```

Expected: `Mapped {/statements/pdf, GET}` line, no errors.

Smoke test (writes the PDF to disk for inspection):

```bash
CUST_ID=$(docker compose exec -T postgres psql -U postgres -d simplebooks -tA -c "SELECT id FROM \"Customer\" LIMIT 1;")
CO_ID=$(docker compose exec -T postgres psql -U postgres -d simplebooks -tA -c "SELECT \"billingCompanyId\" FROM \"Customer\" WHERE id='$CUST_ID';")
curl -s "http://localhost:4000/statements/pdf?customerId=$CUST_ID&billingCompanyId=$CO_ID" -o /tmp/statement.pdf
file /tmp/statement.pdf
```

Expected: `/tmp/statement.pdf: PDF document, version 1.x`. Open it manually if you want to eyeball the layout.

- [ ] **Step 4: Commit**

```bash
git add backend/src/pdf/pdf.service.ts backend/src/statements/statements.controller.ts
git commit -m "feat(statements): PDF render + GET /statements/pdf"
```

---

## Task 7: MailService.sendStatement + send-context + POST /statements/send

**Files:**
- Modify: `backend/src/mail/mail.service.ts`
- Modify: `backend/src/statements/statements.service.ts`
- Modify: `backend/src/statements/statements.controller.ts`

- [ ] **Step 1: Add a shared SMTP resolver for billing companies in MailService**

In `backend/src/mail/mail.service.ts`, refactor `resolveConfigForInvoice` so the per-company resolution logic is also reachable for statements. Replace it with:

```ts
private async resolveConfigForCompany(billingCompanyId: string | null): Promise<SmtpConfig | null> {
  if (!billingCompanyId) return this.resolveSystemConfig();
  const co = await this.prisma.billingCompany.findUnique({ where: { id: billingCompanyId } });
  if (
    co?.sendVia === 'CUSTOM_SMTP' &&
    co.customSmtpServer &&
    co.customSmtpPort &&
    co.customSmtpEncryption
  ) {
    return {
      smtpServer: co.customSmtpServer,
      port: co.customSmtpPort,
      encryption: co.customSmtpEncryption,
      user: co.customSmtpUser ?? '',
      password: co.customSmtpPassword ?? '',
    };
  }
  return this.resolveSystemConfig();
}

private async resolveSystemConfig(): Promise<SmtpConfig | null> {
  const sys = await this.prisma.mailConfiguration.findFirst();
  if (!sys || !sys.smtpServer) return null;
  return {
    smtpServer: sys.smtpServer,
    port: sys.port,
    encryption: sys.encryption,
    user: sys.user,
    password: sys.password,
  };
}

private async resolveConfigForInvoice(invoiceId: string): Promise<SmtpConfig | null> {
  const inv = await this.prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { billingCompanyId: true },
  });
  if (!inv) return null;
  return this.resolveConfigForCompany(inv.billingCompanyId);
}
```

(The body of `sendInvoice` doesn't change — it still calls `resolveConfigForInvoice`.)

- [ ] **Step 2: Add `SendStatementOverrides` and `sendStatement` to MailService**

`MailService.sendStatement` takes the PDF buffer as an argument rather than rendering it itself — `StatementsService` renders the PDF via `PdfService` (which it already imports) and then calls `MailService.sendStatement` with the buffer in hand. This avoids a circular module dependency (`MailModule` → `StatementsModule` → `MailModule`).

Above the `@Injectable()` line (with other exports), add:

```ts
export type SendStatementOverrides = {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  html?: string;
};
```

Add this method to the `MailService` class (after `sendInvoice`):

```ts
async sendStatement(args: {
  customer: { id: string; billingEmail1: string | null };
  billingCompany: { id: string; name: string; accountsEmail: string | null; invoiceBcc: string };
  pdfBuffer: Buffer;
  pdfFilename: string;
  overrides: SendStatementOverrides;
}): Promise<{ messageId: string }> {
  const to = args.overrides.to?.trim() || args.customer.billingEmail1;
  if (!to) throw new Error('Customer has no primary billing email');

  const cfg = await this.resolveConfigForCompany(args.billingCompany.id);
  if (!cfg) {
    throw new Error(
      'No SMTP configured for this billing company (set to General SMTP but Settings / Mail Configuration is empty).',
    );
  }
  const transport = this.buildTransport(cfg);

  const from = args.overrides.from?.trim() || args.billingCompany.accountsEmail || cfg.user || 'noreply@simplebooks.dev';
  const cc = args.overrides.cc?.trim() || undefined;
  const bcc = args.overrides.bcc?.trim() || args.billingCompany.invoiceBcc || undefined;
  const subject = args.overrides.subject ?? `Statement from ${args.billingCompany.name}`;
  const html = args.overrides.html ?? `<p>Please find your statement attached.</p>`;

  const info = await transport.sendMail({
    from,
    to,
    cc,
    bcc,
    subject,
    html: html || undefined,
    attachments: [{ filename: args.pdfFilename, content: args.pdfBuffer }],
  });
  this.log.log(`Statement sent to ${to}: messageId=${info.messageId}`);
  return { messageId: info.messageId };
}
```

(`StatementsService` will render the PDF first via `PdfService.renderStatement` and pass the buffer in. No circular dependency.)

- [ ] **Step 3: Add `sendContext` and `send` to `StatementsService`**

In `backend/src/statements/statements.service.ts`:

Add to imports:

```ts
import { PdfService } from '../pdf/pdf.service';
import { MailService, SendStatementOverrides } from '../mail/mail.service';
import type { StatementSendContext } from './types';
```

Replace the constructor:

```ts
constructor(
  private prisma: PrismaService,
  private pdf: PdfService,
  private mail: MailService,
) {}
```

Add these methods to the `StatementsService` class:

```ts
async getSendContext(params: GetParams): Promise<StatementSendContext> {
  const payload = await this.getStatement(params);
  const subject = `Statement for ${payload.customer.name} · ${formatRangeForSubject(payload.dateFrom, payload.dateTo)}`;
  const paymentBlock = payload.billingCompany.paymentDetails
    ? `<p style="margin: 16px 0;">${escapeHtml(payload.billingCompany.paymentDetails)}</p>`
    : '';
  const html =
    `<p>Hi ${escapeHtml(payload.customer.name)},</p>` +
    `<p>Please find your statement from ${escapeHtml(payload.billingCompany.name)} attached. ` +
    `The balance due is <strong>$${payload.summary.balanceDue}</strong>.</p>` +
    paymentBlock +
    `<p>Thank you.<br/>${escapeHtml(payload.billingCompany.name)}</p>`;
  return {
    from: payload.billingCompany.accountsEmail ?? '',
    to: payload.customer.billingEmail1 ?? '',
    cc: payload.customer.billingEmail2 ?? '',
    bcc: payload.billingCompany.invoiceBcc ?? '',
    subject,
    html,
  };
}

async send(params: GetParams, overrides: SendStatementOverrides): Promise<{ messageId: string }> {
  const payload = await this.getStatement(params);
  const { buffer, filename } = await this.pdf.renderStatement({
    customer: {
      customerNumber: payload.customer.customerNumber,
      name: payload.customer.name,
      address: payload.customer.address,
      billingEmail1: payload.customer.billingEmail1,
    },
    billingCompany: {
      name: payload.billingCompany.name,
      abn: payload.billingCompany.abn,
      address: payload.billingCompany.address,
      accountsEmail: payload.billingCompany.accountsEmail,
    },
    dateFrom: payload.dateFrom,
    dateTo: payload.dateTo,
    openingBalance: payload.openingBalance,
    rows: payload.rows,
    summary: payload.summary,
  });
  return this.mail.sendStatement({
    customer: { id: payload.customer.id, billingEmail1: payload.customer.billingEmail1 },
    billingCompany: {
      id: payload.billingCompany.id,
      name: payload.billingCompany.name,
      accountsEmail: payload.billingCompany.accountsEmail,
      invoiceBcc: payload.billingCompany.invoiceBcc,
    },
    pdfBuffer: buffer,
    pdfFilename: filename,
    overrides,
  });
}
```

And at module scope (above the `@Injectable()`):

```ts
function formatRangeForSubject(dateFrom: string | null, dateTo: string | null): string {
  if (!dateFrom && !dateTo) return 'All transactions';
  if (dateFrom && dateTo) return `${dateFrom} – ${dateTo}`;
  if (dateFrom) return `from ${dateFrom}`;
  return `to ${dateTo}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
```

- [ ] **Step 4: Wire `GET /statements/send-context` and `POST /statements/send`**

Update `backend/src/statements/statements.controller.ts`:

```ts
import { Body, Controller, Get, Header, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StatementsService } from './statements.service';
import { PdfService } from '../pdf/pdf.service';
import { SendStatementDto, StatementQueryDto } from './dto';

@Controller('statements')
export class StatementsController {
  constructor(
    private statements: StatementsService,
    private pdf: PdfService,
  ) {}

  @Get()
  get(@Query() q: StatementQueryDto) {
    return this.statements.getStatement({
      customerId: q.customerId,
      billingCompanyId: q.billingCompanyId,
      dateFrom: q.dateFrom ?? null,
      dateTo: q.dateTo ?? null,
    });
  }

  // The literal `pdf` and `send-context` routes must come BEFORE any
  // parameterised paths (none today, but mirrors the convention from
  // ai.controller.ts and is safe defensive sequencing).
  @Get('send-context')
  sendContext(@Query() q: StatementQueryDto) {
    return this.statements.getSendContext({
      customerId: q.customerId,
      billingCompanyId: q.billingCompanyId,
      dateFrom: q.dateFrom ?? null,
      dateTo: q.dateTo ?? null,
    });
  }

  @Get('pdf')
  @Header('Content-Type', 'application/pdf')
  async renderPdf(@Query() q: StatementQueryDto, @Res() res: Response) {
    const payload = await this.statements.getStatement({
      customerId: q.customerId,
      billingCompanyId: q.billingCompanyId,
      dateFrom: q.dateFrom ?? null,
      dateTo: q.dateTo ?? null,
    });
    const { buffer, filename } = await this.pdf.renderStatement({
      customer: {
        customerNumber: payload.customer.customerNumber,
        name: payload.customer.name,
        address: payload.customer.address,
        billingEmail1: payload.customer.billingEmail1,
      },
      billingCompany: {
        name: payload.billingCompany.name,
        abn: payload.billingCompany.abn,
        address: payload.billingCompany.address,
        accountsEmail: payload.billingCompany.accountsEmail,
      },
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      openingBalance: payload.openingBalance,
      rows: payload.rows,
      summary: payload.summary,
    });
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.end(buffer);
  }

  @Post('send')
  send(@Body() dto: SendStatementDto) {
    return this.statements.send(
      {
        customerId: dto.customerId,
        billingCompanyId: dto.billingCompanyId,
        dateFrom: dto.dateFrom ?? null,
        dateTo: dto.dateTo ?? null,
      },
      {
        from: dto.fromEmail,
        to: dto.toEmail,
        cc: dto.ccEmail,
        bcc: dto.bccEmail,
        subject: dto.subject,
        html: dto.html,
      },
    );
  }
}
```

- [ ] **Step 5: Rebuild and verify**

```bash
docker compose build backend && docker compose up -d backend
sleep 60
docker logs simplebooks-backend-1 --tail 30
```

Expected: routes `/statements`, `/statements/pdf`, `/statements/send-context`, `/statements/send` mapped. No `Nest can't resolve dependencies` errors.

Smoke-test send-context:

```bash
CUST_ID=$(docker compose exec -T postgres psql -U postgres -d simplebooks -tA -c "SELECT id FROM \"Customer\" LIMIT 1;")
CO_ID=$(docker compose exec -T postgres psql -U postgres -d simplebooks -tA -c "SELECT \"billingCompanyId\" FROM \"Customer\" WHERE id='$CUST_ID';")
curl -s "http://localhost:4000/statements/send-context?customerId=$CUST_ID&billingCompanyId=$CO_ID"
```

Expected: JSON `{"from":"...","to":"...","cc":"...","bcc":"...","subject":"Statement for ...","html":"..."}`.

(Skipping the actual POST /statements/send smoke-test here — that hits SMTP and is exercised by the UI in Task 11.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/mail/mail.service.ts backend/src/statements/statements.service.ts backend/src/statements/statements.controller.ts
git commit -m "feat(statements): send-context, send, MailService.sendStatement"
```

---

## Task 8: Frontend — types + API helpers

**Files:**
- Modify: `frontend/lib/types.ts`
- Create: `frontend/lib/statements.ts`

- [ ] **Step 1: Add types**

Append to `frontend/lib/types.ts`:

```ts
// === Statements ===

export type StatementRowType = 'INVOICE' | 'PAYMENT';

export type StatementRow = {
  date: string;            // YYYY-MM-DD
  type: StatementRowType;
  details: string;
  amount: string;          // "0.00" when PAYMENT
  payment: string;         // "0.00" when INVOICE
  balance: string;
};

export type StatementResponse = {
  customer: {
    id: string;
    customerNumber: number;
    name: string;
    address: string | null;
    billingEmail1: string | null;
    billingEmail2: string | null;
  };
  billingCompany: {
    id: string;
    name: string;
    abn: string | null;
    address: string | null;
    accountsEmail: string | null;
    invoiceBcc: string;
    paymentDetails: string | null;
  };
  dateFrom: string | null;
  dateTo: string | null;
  openingBalance: string;
  rows: StatementRow[];
  summary: { invoicedAmount: string; amountReceived: string; balanceDue: string };
};

export type StatementSendContext = {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  html: string;
};
```

- [ ] **Step 2: Write the API-helpers file**

Create `frontend/lib/statements.ts`:

```ts
import { api, apiClient, browserApiBase } from './api';
import type { StatementResponse, StatementSendContext } from './types';

export type StatementParams = {
  customerId: string;
  billingCompanyId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
};

function toQuery(p: StatementParams): string {
  const qs = new URLSearchParams({
    customerId: p.customerId,
    billingCompanyId: p.billingCompanyId,
  });
  if (p.dateFrom) qs.set('dateFrom', p.dateFrom);
  if (p.dateTo) qs.set('dateTo', p.dateTo);
  return qs.toString();
}

export function getStatement(p: StatementParams): Promise<StatementResponse> {
  return api<StatementResponse>(`/statements?${toQuery(p)}`);
}

export function getStatementSendContext(p: StatementParams): Promise<StatementSendContext> {
  return api<StatementSendContext>(`/statements/send-context?${toQuery(p)}`);
}

// Browser-followed URL (window.open / anchor href). Uses browserApiBase
// because the backend hostname differs between SSR (`http://backend:4000`)
// and the browser (`http://localhost:4000`); statements PDFs are only ever
// opened in the user's browser.
export function statementPdfUrl(p: StatementParams): string {
  return `${browserApiBase()}/statements/pdf?${toQuery(p)}`;
}

export function sendStatement(p: StatementParams & {
  fromEmail: string;
  toEmail: string;
  ccEmail?: string;
  bccEmail?: string;
  subject: string;
  html: string;
}): Promise<{ messageId: string }> {
  return apiClient.post<{ messageId: string }>('/statements/send', {
    customerId: p.customerId,
    billingCompanyId: p.billingCompanyId,
    dateFrom: p.dateFrom ?? undefined,
    dateTo: p.dateTo ?? undefined,
    fromEmail: p.fromEmail,
    toEmail: p.toEmail,
    ccEmail: p.ccEmail || undefined,
    bccEmail: p.bccEmail || undefined,
    subject: p.subject,
    html: p.html,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/statements.ts
git commit -m "feat(statements/frontend): API helpers + types"
```

---

## Task 9: Frontend — replace ComingSoon with real server page

**Files:**
- Modify: `frontend/app/statements/page.tsx`

- [ ] **Step 1: Replace the stub**

Overwrite `frontend/app/statements/page.tsx`:

```tsx
import { api } from "@/lib/api";
import { StatementsPage } from "@/components/statements/statements-page";
import type { BillingCompany, Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

async function load(): Promise<{ customers: Customer[]; companies: BillingCompany[] }> {
  try {
    const [customers, companies] = await Promise.all([
      api<Customer[]>("/customers"),
      api<BillingCompany[]>("/companies"),
    ]);
    return { customers, companies };
  } catch {
    return { customers: [], companies: [] };
  }
}

export default async function Page() {
  const { customers, companies } = await load();
  return <StatementsPage customers={customers} companies={companies} />;
}
```

- [ ] **Step 2: Don't run anything yet**

The page won't render until `StatementsPage` exists — that's Task 10. This is intentional: the next task builds it.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/statements/page.tsx
git commit -m "feat(statements/frontend): server page loader"
```

---

## Task 10: Frontend — StatementsPage component

**Files:**
- Create: `frontend/components/statements/statements-page.tsx`

- [ ] **Step 1: Write the client component**

Create `frontend/components/statements/statements-page.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStatement, statementPdfUrl } from "@/lib/statements";
import type { BillingCompany, Customer, StatementResponse } from "@/lib/types";
import { SendStatementDialog } from "./send-statement-dialog";

function fmtMoney(s: string | number) {
  return Number(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDdMmYyyy(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-");
  return `${d}/${m}/${y}`;
}

export function StatementsPage({
  customers,
  companies,
}: {
  customers: Customer[];
  companies: BillingCompany[];
}) {
  const [customerId, setCustomerId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statement, setStatement] = useState<StatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const sortedCustomers = useMemo(
    () => customers.filter((c) => c.isActive).slice().sort((a, b) => a.customerNumber - b.customerNumber),
    [customers],
  );
  const sortedCompanies = useMemo(
    () => companies.filter((c) => c.isActive).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [companies],
  );

  // When a customer is picked, auto-fill the billing company with their
  // assigned `billingCompanyId`. User can still override.
  useEffect(() => {
    if (!customerId) return;
    const cust = customers.find((c) => c.id === customerId);
    if (cust?.billingCompanyId) setCompanyId(cust.billingCompanyId);
  }, [customerId, customers]);

  // Refetch whenever the four filters change AND both required ids are set.
  useEffect(() => {
    if (!customerId || !companyId) {
      setStatement(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getStatement({
      customerId,
      billingCompanyId: companyId,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    })
      .then((r) => { if (!cancelled) setStatement(r); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Failed to load statement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, companyId, dateFrom, dateTo]);

  const canAct = Boolean(customerId && companyId && statement && !loading);

  function openPdf() {
    if (!canAct) return;
    window.open(statementPdfUrl({
      customerId,
      billingCompanyId: companyId,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    }), "_blank");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto max-w-6xl p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Customer Statements</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!canAct} onClick={() => setSendOpen(true)}>
            <Mail className="h-4 w-4" /> Send
          </Button>
          <Button variant="outline" size="sm" disabled={!canAct} onClick={openPdf}>
            <Download className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <Card className="space-y-5 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 text-sm md:flex-nowrap md:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Customer:</span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="h-9 rounded-[0.3rem] border border-slate-200 bg-white px-2 text-sm"
            >
              <option value="">— Select —</option>
              {sortedCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customerNumber} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Billing Co:</span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="h-9 rounded-[0.3rem] border border-slate-200 bg-white px-2 text-sm"
            >
              <option value="">— Select —</option>
              {sortedCompanies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Date:</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
            <span className="text-slate-400">—</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
          </div>
        </div>

        <hr className="border-slate-100" />

        {!customerId || !companyId ? (
          <div className="flex h-72 flex-col items-center justify-center text-sm text-slate-400">
            Pick a customer and billing company to view their statement
          </div>
        ) : loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : error ? (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : statement ? (
          <StatementView s={statement} />
        ) : null}
      </Card>

      {statement ? (
        <SendStatementDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          params={{
            customerId,
            billingCompanyId: companyId,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
          }}
          customerName={statement.customer.name}
        />
      ) : null}
    </motion.div>
  );
}

function StatementView({ s }: { s: StatementResponse }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="text-sm text-slate-700">
          <div className="font-semibold text-slate-900">To</div>
          <div className="font-semibold">{s.customer.name}</div>
          {s.customer.address ? <div className="whitespace-pre-line text-slate-600">{s.customer.address}</div> : null}
        </div>
        <div className="text-right text-sm">
          <div className="text-xl font-semibold text-slate-900">Statement of Accounts</div>
          <div className="border-t border-slate-300 pt-1 text-slate-500">
            {s.dateFrom && s.dateTo
              ? `${toDdMmYyyy(s.dateFrom)} To ${toDdMmYyyy(s.dateTo)}`
              : s.dateFrom
              ? `From ${toDdMmYyyy(s.dateFrom)}`
              : s.dateTo
              ? `To ${toDdMmYyyy(s.dateTo)}`
              : "All transactions"}
          </div>
        </div>
      </div>

      <div className="ml-auto w-full max-w-xs rounded-lg bg-slate-50 p-4 text-sm">
        <div className="mb-2 font-semibold text-slate-900">Account Summary</div>
        <SumRow label="Opening Balance" value={s.openingBalance} />
        <SumRow label="Invoiced Amount" value={s.summary.invoicedAmount} />
        <SumRow label="Amount Received" value={s.summary.amountReceived} />
        <SumRow label="Balance Due" value={s.summary.balanceDue} strong />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-700 text-left text-xs font-semibold text-white">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Transactions</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Payments</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {s.dateFrom ? (
              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">{toDdMmYyyy(s.dateFrom)}</td>
                <td className="px-3 py-2">Opening</td>
                <td className="px-3 py-2">***Opening Balance***</td>
                <td className="px-3 py-2 text-right">{fmtMoney(s.openingBalance)}</td>
                <td className="px-3 py-2 text-right"></td>
                <td className="px-3 py-2 text-right">{fmtMoney(s.openingBalance)}</td>
              </tr>
            ) : null}
            {s.rows.length === 0 && !s.dateFrom ? (
              <tr><td className="px-3 py-6 text-center text-slate-400" colSpan={6}>No transactions in this period</td></tr>
            ) : null}
            {s.rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-3 py-2">{toDdMmYyyy(r.date)}</td>
                <td className="px-3 py-2">{r.type === "INVOICE" ? "Invoice" : "Payment Received"}</td>
                <td className="px-3 py-2">{r.details}</td>
                <td className="px-3 py-2 text-right">{r.type === "INVOICE" ? fmtMoney(r.amount) : ""}</td>
                <td className="px-3 py-2 text-right">{r.type === "PAYMENT" ? fmtMoney(r.payment) : ""}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(r.balance)}</td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-3 text-right font-semibold" colSpan={5}>Balance Due</td>
              <td className="px-3 py-3 text-right font-semibold">${fmtMoney(s.summary.balanceDue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "mt-2 border-t border-slate-200 pt-2 font-semibold" : "py-0.5"}`}>
      <span className="text-slate-600">{label}</span>
      <span>${fmtMoney(value)}</span>
    </div>
  );
}
```

- [ ] **Step 2: Don't run yet**

The page imports `SendStatementDialog` from Task 11. Frontend rebuild waits until both files exist.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/statements/statements-page.tsx
git commit -m "feat(statements/frontend): StatementsPage on-screen view"
```

---

## Task 11: Frontend — SendStatementDialog + verify the whole flow

**Files:**
- Create: `frontend/components/statements/send-statement-dialog.tsx`

- [ ] **Step 1: Write the dialog**

Create `frontend/components/statements/send-statement-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";
import { getStatementSendContext, sendStatement } from "@/lib/statements";
import type { StatementSendContext } from "@/lib/types";
import { parseApiError } from "@/lib/api-errors";

type Phase = "loading" | "compose" | "sending" | "sent" | "error";

export function SendStatementDialog({
  open,
  onOpenChange,
  params,
  customerName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: {
    customerId: string;
    billingCompanyId: string;
    dateFrom: string | null;
    dateTo: string | null;
  };
  customerName: string;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    setError(null);
    getStatementSendContext(params)
      .then((ctx: StatementSendContext) => {
        setFrom(ctx.from);
        setTo(ctx.to);
        setCc(ctx.cc);
        setBcc(ctx.bcc);
        setSubject(ctx.subject);
        setHtml(ctx.html);
        setPhase("compose");
      })
      .catch((e: any) => {
        setError(parseApiError(e?.message));
        setPhase("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, params.customerId, params.billingCompanyId, params.dateFrom, params.dateTo]);

  async function submit() {
    setPhase("sending");
    setError(null);
    try {
      await sendStatement({
        ...params,
        fromEmail: from,
        toEmail: to,
        ccEmail: cc || undefined,
        bccEmail: bcc || undefined,
        subject,
        html,
      });
      setPhase("sent");
    } catch (e: any) {
      setError(parseApiError(e?.message));
      setPhase("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Statement</DialogTitle>
          <DialogDescription>
            Statement for {customerName} · PDF will be attached. Edit recipients or subject, then send.
          </DialogDescription>
        </DialogHeader>

        {phase === "loading" ? (
          <div className="flex items-center gap-3 py-6 text-sm text-slate-600" aria-live="polite">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" aria-hidden />
            Loading…
          </div>
        ) : null}

        {phase === "compose" ? (
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex flex-col gap-3">
              <Field label="From" required>
                <Input value={from} onChange={(e) => setFrom(e.target.value)} required />
              </Field>
              <Field label="To" required>
                <Input value={to} onChange={(e) => setTo(e.target.value)} required />
              </Field>
              <Field label="CC">
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="BCC">
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Subject" required>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </Field>
              <Field label="Body" hint="Read-only preview">
                <div
                  className="max-h-72 overflow-y-auto rounded-[0.3rem] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 [&_p]:my-2 [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {phase === "sending" ? (
          <div className="flex items-center gap-3 py-6 text-sm text-slate-600" aria-live="polite">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" aria-hidden />
            Sending…
          </div>
        ) : null}

        {phase === "sent" ? (
          <div className="py-2">
            <p className="text-sm text-emerald-700" role="status">Statement sent successfully.</p>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="space-y-2 py-2">
            <p className="text-sm text-rose-600" role="alert">{error}</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              {to && subject ? (
                <Button type="button" onClick={submit}>Try again</Button>
              ) : null}
            </DialogFooter>
          </div>
        ) : null}

        {phase === "compose" ? (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={!from || !to || !subject}>
              <Mail className="h-3.5 w-3.5" />
              Send Statement
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Rebuild the frontend**

```bash
docker compose build frontend && docker compose up -d frontend
sleep 30
docker logs simplebooks-frontend-1 --tail 20
```

Expected: no compile errors, `Ready in ...` line.

- [ ] **Step 3: Manual smoke test in the browser**

Open `http://localhost:3000/statements`:

- Page renders with the title "Customer Statements", the filter row (Customer / Billing Co / Date range), and Send + PDF buttons disabled.
- Picking a Customer auto-fills the Billing Co dropdown (verify by picking a different customer — Billing Co value updates).
- With both picked, the statement renders: From / To blocks, summary card, transactions table.
- Click **PDF** → opens an inline PDF in a new tab.
- Click **Send** → dialog appears with pre-filled From / To / CC / BCC / Subject / Body.
- Pick a date range and confirm the rendered statement narrows accordingly, with an opening-balance row.
- Toggle to a customer with no invoices for the selected billing company — table shows "No transactions in this period".

Don't click Send for real unless `MailConfiguration` is set up — instead verify the dialog opens correctly.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/statements/send-statement-dialog.tsx
git commit -m "feat(statements/frontend): SendStatementDialog"
```

---

## Task 12: Documentation

**Files:**
- Modify: `modules_and_logic.md`
- Modify: `Architecture.md`

- [ ] **Step 1: Add a Statements section to `modules_and_logic.md`**

Find the existing Reports section (search for `## Reports` or `### Reports`). Below the existing reports entries (Expense / Income / Tags), add:

```markdown
### Statements

Page at `/statements` (sidebar: Reports → Statements). Renders a Customer Statement for one Customer + one Billing Company over an optional date range.

**Filters:**
- Customer (required) — active customers only, sorted by `customerNumber`.
- Billing Company (required) — auto-fills from `Customer.billingCompanyId` on pick, user may override.
- Date From / Date To — both optional; empty = "all transactions" (no opening balance).

**On-screen layout:**
- Header: page title + Send / PDF buttons (disabled until both Customer and Billing Company are picked).
- "To" customer block + "Statement of Accounts" title with date range.
- Summary card (right-aligned): Opening Balance, Invoiced Amount, Amount Received, Balance Due.
- Transactions table: Date / Transactions / Details / Amount / Payments / Balance. When `dateFrom` is set, the first row is an "Opening Balance" pseudo-row.
- Balance Due footer row.

**Math:**
- Opening Balance = Σ totalAmount of (customerId, billingCompanyId, status != VOID) invoices with `invoiceDate < from` − Σ allocation amounts on those invoices where `tx.date < from`. Zero when `from` is empty.
- Body invoice rows: one per invoice for `(customer, company, status != VOID, invoiceDate in [from, to])`.
- Body payment rows: one per Transaction whose date is in `[from, to]` AND has at least one allocation to a `(customer, company, non-VOID)` invoice. Payment amount = sum of those in-scope allocations only (cross-company / VOID-allocated portions are excluded).
- Sort by date asc; same-day tiebreaker: invoices before payments, then by invoiceNumber / transactionId asc.
- Running balance: seeded with `openingBalance`, walked over rows: `balance[i] = balance[i-1] + amount[i] - payment[i]`.
- Summary: `invoicedAmount` = Σ body invoice amounts (does NOT include opening); `amountReceived` = Σ body payment amounts; `balanceDue = openingBalance + invoicedAmount - amountReceived`.

**Actions:**
- PDF — opens `GET /statements/pdf` inline in a new tab.
- Send — opens dialog pre-filled from `GET /statements/send-context` (From = billing company `accountsEmail`, To = customer `billingEmail1`, CC = customer `billingEmail2`, BCC = billing company `invoiceBcc`, subject + plain HTML body hardcoded). Posts to `POST /statements/send`; PDF is always attached. No DB-stored email template — change the body/subject defaults in `StatementsService.getSendContext`.

**Math is computed server-side from `Invoice` + `Allocation` + `Transaction` directly — `Invoice.amountPaid` / `amountOutstanding` are NOT used (avoids drift if those columns lag).**

**No schema changes** — Phase E is fully additive.
```

- [ ] **Step 2: Add a Statements module entry to `Architecture.md`**

Find the backend module list (search for `**\`payments\` module**` to locate the spot). After the payments entry, add:

```markdown
- **`statements` module** — **(Phase E)** Customer Statements. Route prefix `/statements`. `StatementsService.getStatement` computes opening balance, body rows, and summary from `Invoice` + `Allocation` + `Transaction` data (no schema changes). `PdfService.renderStatement` produces the PDF via the new `customer-statement.tsx` React-PDF template. `MailService.sendStatement` dispatches the statement email with the rendered PDF attached. Endpoints: `GET /statements`, `GET /statements/pdf`, `GET /statements/send-context`, `POST /statements/send`.
```

- [ ] **Step 3: Commit**

```bash
git add modules_and_logic.md Architecture.md
git commit -m "docs(statements): modules_and_logic + Architecture entries"
```

---

## Self-Review Notes

**Spec coverage checked:**
- Opening balance formula → Task 2 + Task 3
- Body rows, payment grouping, VOID exclusion → Task 3
- Sort tiebreaker → Task 3 (second test)
- Running balance → Task 3
- Summary card → Task 3
- 4 endpoints → Tasks 4, 6, 7
- PDF template → Task 5
- Mail send → Task 7
- Customer auto-billing-company → Task 10
- Send dialog → Task 11
- Docs → Task 12

**Type consistency:** `StatementResponse` / `StatementRow` / `StatementSendContext` names match between backend `types.ts`, frontend `types.ts`, and consumers. `StatementParams` is frontend-only. `SendStatementOverrides` (backend) and the `sendStatement` arg shape (frontend) both use `fromEmail` / `toEmail` style names through the DTO, but `MailService.sendStatement` internally uses the same names as `SendInvoiceOverrides` (`from` / `to` / `cc` / `bcc`) — the DTO ↔ overrides mapping happens in the controller and is explicit.

**Bite-sized check:** Tasks 5, 7, and 10 are large (template + multi-method service additions + multi-component frontend). Each is structured so a fresh subagent reads exactly what to write — no cross-references to other tasks for code content.

**No placeholders** — every file body is included as runnable code.
