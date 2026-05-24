# Invoice Payment Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match bank transactions to customer invoices with a deterministic scoring engine, a many-to-many Allocation join, derived invoice status, customer credit as a view, and a three-context `ApplyPaymentModal` UI — all additive to schema so no `down -v` is required.

**Architecture:** New backend `payments` module (`payments.module.ts`, `payments.service.ts`, `payments.controller.ts`, plus three pure helpers `recompute.ts` / `scoring.ts` / `bundle.ts` and a one-shot `backfill.ts`). An `Allocation` join table sits between `Transaction` and `Invoice`; `Invoice.amountPaid` / `amountOutstanding` are denormalised columns kept in sync by `recomputeInvoicePayment` inside every allocation transaction. `AllocationEvent` is an append-only audit log mirroring the `CategorisationEvent` pattern. Customer credit is a derived SQL view (no table). Frontend adds a `/banking/payments` review queue, a sidebar entry with badge polling, an Allocations panel on the invoice view, a Vendor → Customer linkage field, and an `ApplyPaymentModal` reused across three launch contexts (queue, invoice "Receive payment", transaction row menu).

**Tech Stack:** NestJS 10, Prisma 5 (with `Decimal` from `@prisma/client/runtime/library` for conservation maths), Next.js 15 (App Router, React 19), Postgres, Jest 29 (already configured per Phase C). No new dependencies.

**Authoritative spec:** [`../specs/2026-05-24-invoice-payment-matching-design.md`](../specs/2026-05-24-invoice-payment-matching-design.md). If anything below conflicts with the spec, the spec wins — report the discrepancy.

---

## File inventory

### Backend — new

- `backend/src/payments/payments.module.ts`
- `backend/src/payments/payments.controller.ts`
- `backend/src/payments/payments.service.ts`
- `backend/src/payments/payments.service.spec.ts`
- `backend/src/payments/payments.dto.ts`
- `backend/src/payments/types.ts`
- `backend/src/payments/recompute.ts`
- `backend/src/payments/recompute.spec.ts`
- `backend/src/payments/scoring.ts`
- `backend/src/payments/scoring.spec.ts`
- `backend/src/payments/bundle.ts`
- `backend/src/payments/bundle.spec.ts`
- `backend/src/payments/backfill.ts`
- `backend/src/payments/backfill.spec.ts`

### Backend — modified

- `backend/prisma/schema.prisma` (additive only — `amountPaid` / `amountOutstanding` columns on `Invoice`, `Vendor.customerId`, `Transaction.paymentReviewDismissedAt`, `Allocation` + `AllocationEvent` models, two new enums. The existing `InvoiceStatus.PARTIAL_PAID` value is reused — no enum changes.)
- `backend/src/app.module.ts` (register `PaymentsModule`)
- `backend/src/vendors/dto.ts` (allow `customerId` on `UpdateVendorDto`)
- `backend/src/vendors/vendors.service.ts` (pass `customerId` through update)
- `backend/src/customers/customers.controller.ts` (mount `GET /customers/:id/credit` — delegate to PaymentsService)
- `backend/src/customers/customers.module.ts` (import PaymentsModule so the controller can inject PaymentsService)

### Frontend — new

- `frontend/lib/payments.ts`
- `frontend/app/banking/payments/page.tsx`
- `frontend/components/payments/payments-queue.tsx`
- `frontend/components/payments/apply-payment-modal.tsx`
- `frontend/components/payments/allocations-panel.tsx`
- `frontend/components/payments/unapply-confirm-dialog.tsx`

### Frontend — modified

- `frontend/lib/types.ts` (add `Allocation`, `AllocationEvent`, `ScoredInvoice`, `BundleSuggestion`, `CustomerCredit`, `PaymentQueueItem`; extend `Invoice`, `Vendor`; widen `InvoiceStatus` to include `PARTIAL_PAID`)
- `frontend/components/vendors/vendor-form.tsx` (Customer Select)
- `frontend/components/invoices/invoices-list.tsx` (`PARTIAL_PAID` badge tone + filter pill)
- `frontend/components/invoices/invoice-form.tsx` (gate manual status control)
- `frontend/components/layout/sidebar.tsx` (Payments nav entry + badge polling)
- `frontend/components/transactions/transaction-row-menu.tsx` ("Apply to invoices" menu item)
- existing invoice view (Allocations panel + "Receive payment" button) — file path determined in Task 21

### Docs — modified

- `CLAUDE.md`, `Architecture.md`, `DatabaseSchema.md`, `modules_and_logic.md`, `DesignSystem.md` (PARTIAL_PAID badge tone)

---

## Task 1: Schema additions

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Verify `InvoiceStatus.PARTIAL_PAID` already exists**

  No change to the enum is needed — `PARTIAL_PAID` was added in prior work and is already used throughout the codebase (see `frontend/lib/types.ts`, `dashboard.service.ts`, `public-invoices.service.ts`). Sanity-check it's there before proceeding:

  ```bash
  grep -A 10 "enum InvoiceStatus" backend/prisma/schema.prisma
  ```

  Expected output contains `PARTIAL_PAID` between `VIEWED` and `PAID`. If for any reason the value is missing, add it; otherwise leave the enum untouched.

- [ ] **Step 2: Extend `Invoice` with denormalised payment columns + back-relation**

  Inside the `Invoice` model, just above the closing brace, add:

  ```prisma
    amountPaid        Decimal      @db.Decimal(12, 2) @default(0)
    amountOutstanding Decimal      @db.Decimal(12, 2) @default(0)

    allocations Allocation[]
  ```

- [ ] **Step 3: Extend `Vendor` with optional `customerId` + back-relation**

  Inside the `Vendor` model, just above the closing brace, add:

  ```prisma
    customerId String?
    customer   Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)
  ```

  Inside the `Customer` model, add the back-relation:

  ```prisma
    vendors Vendor[]
  ```

- [ ] **Step 4: Extend `Transaction` with dismissal + back-relation**

  Inside the `Transaction` model, just above the closing brace, add:

  ```prisma
    paymentReviewDismissedAt DateTime?
    allocations              Allocation[]
  ```

- [ ] **Step 5: Append the two new enums + two new models at the end of `schema.prisma`**

  ```prisma
  enum AllocationEventType {
    CREATED
    DELETED
  }

  enum AllocationEventSource {
    USER
  }

  model Allocation {
    id            String      @id @default(uuid())
    transactionId String
    transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
    invoiceId     String
    invoice       Invoice     @relation(fields: [invoiceId], references: [id], onDelete: Restrict)
    amount        Decimal     @db.Decimal(14, 2)
    createdAt     DateTime    @default(now())

    @@index([transactionId])
    @@index([invoiceId])
  }

  model AllocationEvent {
    id                  String                @id @default(uuid())
    eventType           AllocationEventType
    transactionId       String
    invoiceId           String
    amount              Decimal               @db.Decimal(14, 2)
    invoiceStatusBefore InvoiceStatus
    invoiceStatusAfter  InvoiceStatus
    source              AllocationEventSource @default(USER)
    createdAt           DateTime              @default(now())

    @@index([transactionId])
    @@index([invoiceId])
    @@index([createdAt])
  }
  ```

- [ ] **Step 6: Apply the schema and regenerate the Prisma client**

  Run:
  ```bash
  docker compose build backend && docker compose up -d backend
  ```
  The entrypoint runs `prisma db push --accept-data-loss` and regenerates the client automatically. Wait for the backend logs to show "Application is running".

- [ ] **Step 7: Verify the new table exists (no `down -v` required)**

  Run:
  ```bash
  docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c '\d "Allocation"'
  docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c '\d "AllocationEvent"'
  docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c "SELECT enum_range(NULL::\"InvoiceStatus\");"
  ```
  Expected: `Allocation` table prints with columns `id`, `transactionId`, `invoiceId`, `amount`, `createdAt`. `AllocationEvent` prints with all spec columns. The `InvoiceStatus` enum_range includes `PARTIAL_PAID`.

- [ ] **Step 8: Commit**

  ```bash
  git add backend/prisma/schema.prisma
  git commit -m "feat(payments): additive schema — Allocation, AllocationEvent, PARTIAL_PAID status, Vendor.customerId"
  ```

---

## Task 2: `recomputeInvoicePayment` helper + unit tests

Pure function — takes an invoice snapshot + allocation amounts, returns `{amountPaid, amountOutstanding, status}`. The actual DB-write wrapper lives in `PaymentsService`; this is the deterministic core, fully testable without Prisma.

**Files:**
- Create: `backend/src/payments/recompute.ts`
- Create: `backend/src/payments/recompute.spec.ts`

- [ ] **Step 1: Write the failing spec**

  Create `backend/src/payments/recompute.spec.ts`:

  ```ts
  import { Decimal } from '@prisma/client/runtime/library';
  import { recomputeInvoicePayment } from './recompute';

  // Minimal invoice shape used by the helper. Mirrors what PaymentsService selects.
  function inv(over: Partial<{
    status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'VOID';
    totalAmount: string;
    viewedAt: Date | null;
    sendAttempts: number;
  }> = {}) {
    return {
      status: over.status ?? 'SENT',
      totalAmount: new Decimal(over.totalAmount ?? '100.00'),
      viewedAt: over.viewedAt ?? null,
      sendAttempts: over.sendAttempts ?? 1,
    };
  }

  function allocs(...amounts: string[]) {
    return amounts.map((a) => ({ amount: new Decimal(a) }));
  }

  describe('recomputeInvoicePayment', () => {
    it('returns DRAFT when status is DRAFT, no allocations, no sendAttempts, no viewedAt', () => {
      const r = recomputeInvoicePayment(inv({ status: 'DRAFT', sendAttempts: 0 }), []);
      expect(r.status).toBe('DRAFT');
      expect(r.amountPaid.toString()).toBe('0');
      expect(r.amountOutstanding.toString()).toBe('100');
    });

    it('returns SENT when sendAttempts > 0 and no allocations and no viewedAt', () => {
      const r = recomputeInvoicePayment(inv({ status: 'SENT' }), []);
      expect(r.status).toBe('SENT');
    });

    it('returns VIEWED when viewedAt is set and no allocations', () => {
      const r = recomputeInvoicePayment(inv({ status: 'VIEWED', viewedAt: new Date() }), []);
      expect(r.status).toBe('VIEWED');
    });

    it('returns PARTIAL_PAID when 0 < allocSum < totalAmount', () => {
      const r = recomputeInvoicePayment(inv({ status: 'SENT', totalAmount: '100.00' }), allocs('40.00'));
      expect(r.status).toBe('PARTIAL_PAID');
      expect(r.amountPaid.toString()).toBe('40');
      expect(r.amountOutstanding.toString()).toBe('60');
    });

    it('returns PAID when allocSum equals totalAmount', () => {
      const r = recomputeInvoicePayment(inv({ status: 'PARTIAL_PAID', totalAmount: '100.00' }), allocs('60.00', '40.00'));
      expect(r.status).toBe('PAID');
      expect(r.amountPaid.toString()).toBe('100');
      expect(r.amountOutstanding.toString()).toBe('0');
    });

    it('VOID is terminal — never recomputed away even when allocations sum to total', () => {
      const r = recomputeInvoicePayment(inv({ status: 'VOID', totalAmount: '100.00' }), allocs('100.00'));
      expect(r.status).toBe('VOID');
    });

    it('viewedAt is sticky — un-applied PAID with viewedAt reverts to VIEWED, not SENT', () => {
      const r = recomputeInvoicePayment(inv({ status: 'PAID', totalAmount: '100.00', viewedAt: new Date(), sendAttempts: 1 }), []);
      expect(r.status).toBe('VIEWED');
    });

    it('un-applied PAID without viewedAt reverts to SENT when sendAttempts > 0', () => {
      const r = recomputeInvoicePayment(inv({ status: 'PAID', totalAmount: '100.00', viewedAt: null, sendAttempts: 1 }), []);
      expect(r.status).toBe('SENT');
    });

    it('totalAmount = 0 with 0 allocations satisfies allocSum == totalAmount → PAID', () => {
      const r = recomputeInvoicePayment(inv({ status: 'DRAFT', totalAmount: '0.00', sendAttempts: 0 }), []);
      expect(r.status).toBe('PAID');
    });

    it('is idempotent — running on a stable invoice changes nothing', () => {
      const invoice = inv({ status: 'PARTIAL_PAID', totalAmount: '100.00' });
      const a = allocs('40.00');
      const r1 = recomputeInvoicePayment(invoice, a);
      const r2 = recomputeInvoicePayment({ ...invoice, status: r1.status }, a);
      expect(r1).toEqual(r2);
    });
  });
  ```

- [ ] **Step 2: Run the spec, verify it fails**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=recompute.spec.ts
  ```
  Expected: FAIL — module `./recompute` not found.

- [ ] **Step 3: Implement the helper**

  Create `backend/src/payments/recompute.ts`:

  ```ts
  import { Decimal } from '@prisma/client/runtime/library';

  export type DerivableStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'VOID';

  export interface RecomputeInvoiceInput {
    status: DerivableStatus;
    totalAmount: Decimal;
    viewedAt: Date | null;
    sendAttempts: number;
  }

  export interface RecomputeAllocation {
    amount: Decimal;
  }

  export interface RecomputeResult {
    amountPaid: Decimal;
    amountOutstanding: Decimal;
    status: DerivableStatus;
  }

  export function recomputeInvoicePayment(
    invoice: RecomputeInvoiceInput,
    allocations: RecomputeAllocation[],
  ): RecomputeResult {
    const allocSum = allocations.reduce(
      (acc, a) => acc.add(a.amount),
      new Decimal(0),
    );
    const amountPaid = allocSum;
    const amountOutstanding = invoice.totalAmount.sub(allocSum);

    // VOID is terminal — never auto-changed by this helper.
    if (invoice.status === 'VOID') {
      return { amountPaid, amountOutstanding, status: 'VOID' };
    }

    let status: DerivableStatus;
    if (allocSum.eq(invoice.totalAmount)) {
      status = 'PAID';
    } else if (allocSum.gt(0)) {
      status = 'PARTIAL_PAID';
    } else if (invoice.viewedAt !== null) {
      status = 'VIEWED';
    } else if (invoice.sendAttempts > 0) {
      status = 'SENT';
    } else {
      status = 'DRAFT';
    }
    return { amountPaid, amountOutstanding, status };
  }
  ```

- [ ] **Step 4: Run the spec, verify it passes**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=recompute.spec.ts
  ```
  Expected: PASS — 10 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/payments/recompute.ts backend/src/payments/recompute.spec.ts
  git commit -m "feat(payments): recomputeInvoicePayment helper + table-driven tests"
  ```

---

## Task 3: `scoreInvoice` helper + unit tests

Six-signal deterministic scorer per spec §3. Pure function — no I/O.

**Files:**
- Create: `backend/src/payments/scoring.ts`
- Create: `backend/src/payments/scoring.spec.ts`

- [ ] **Step 1: Write the failing spec**

  Create `backend/src/payments/scoring.spec.ts`:

  ```ts
  import { Decimal } from '@prisma/client/runtime/library';
  import { scoreInvoice, type ScoreTransaction, type ScoreInvoice, type ScoreCustomer } from './scoring';

  function tx(over: Partial<ScoreTransaction> = {}): ScoreTransaction {
    return {
      description: over.description ?? '',
      unallocated: over.unallocated ?? new Decimal('100.00'),
      date: over.date ?? new Date('2026-01-15'),
    };
  }

  function invoice(over: Partial<ScoreInvoice> = {}): ScoreInvoice {
    return {
      invoiceNumber: over.invoiceNumber ?? 1011,
      amountOutstanding: over.amountOutstanding ?? new Decimal('100.00'),
      invoiceDate: over.invoiceDate ?? new Date('2026-01-01'),
      status: over.status ?? 'SENT',
    };
  }

  function customer(over: Partial<ScoreCustomer> = {}): ScoreCustomer {
    return { displayName: over.displayName ?? 'Office Cleaners Maddington' };
  }

  describe('scoreInvoice — signal isolation', () => {
    it('invoice# match in description: +60', () => {
      const s = scoreInvoice(tx({ description: 'PMT INV1011 THANKS' }), invoice(), customer({ displayName: 'X' }));
      expect(s.total).toBe(60);
      expect(s.signals.invoiceNumber).toBe(true);
    });

    it('invoice# with leading zeros: +60', () => {
      const s = scoreInvoice(tx({ description: 'INV-001011' }), invoice(), customer({ displayName: 'X' }));
      expect(s.signals.invoiceNumber).toBe(true);
    });

    it('invoice# with space: +60', () => {
      const s = scoreInvoice(tx({ description: 'PMT INV 1011' }), invoice(), customer({ displayName: 'X' }));
      expect(s.signals.invoiceNumber).toBe(true);
    });

    it('invoice# present but WRONG number: 0', () => {
      const s = scoreInvoice(tx({ description: 'INV-9999' }), invoice({ invoiceNumber: 1011 }), customer({ displayName: 'X' }));
      expect(s.signals.invoiceNumber).toBe(false);
      expect(s.total).toBe(0);
    });

    it('exact amount equality (Decimal): +40 — no other signals', () => {
      const s = scoreInvoice(
        tx({ unallocated: new Decimal('1234.56'), description: 'XYZ', date: new Date('2026-12-31') }),
        invoice({ amountOutstanding: new Decimal('1234.56'), invoiceDate: new Date('2020-01-01') }),
        customer({ displayName: 'X' }),
      );
      expect(s.total).toBe(40);
      expect(s.signals.exactAmount).toBe(true);
    });

    it('exact amount mismatch (1 cent off): 0', () => {
      const s = scoreInvoice(
        tx({ unallocated: new Decimal('1234.55') }),
        invoice({ amountOutstanding: new Decimal('1234.56') }),
        customer({ displayName: 'X' }),
      );
      expect(s.signals.exactAmount).toBe(false);
    });

    it('customer-name token (>=4 chars) matches: +15', () => {
      const s = scoreInvoice(
        tx({ description: 'pmt from cleaners ltd' }),
        invoice(),
        customer({ displayName: 'Office Cleaners Maddington' }),
      );
      expect(s.signals.customerToken).toBe(true);
    });

    it('customer-name 3-char token does NOT count (e.g. "LTD")', () => {
      const s = scoreInvoice(
        tx({ description: 'PMT FROM LTD' }),
        invoice(),
        customer({ displayName: 'LTD PTY THE' }),
      );
      expect(s.signals.customerToken).toBe(false);
    });

    it('date exactly invoiceDate: +10', () => {
      const d = new Date('2026-01-01');
      const s = scoreInvoice(tx({ date: d }), invoice({ invoiceDate: d }), customer({ displayName: 'X' }));
      expect(s.signals.datePlausible).toBe(true);
    });

    it('date invoiceDate + 60d: +10 (inclusive upper)', () => {
      const s = scoreInvoice(
        tx({ date: new Date('2026-03-02') }),
        invoice({ invoiceDate: new Date('2026-01-01') }),
        customer({ displayName: 'X' }),
      );
      expect(s.signals.datePlausible).toBe(true);
    });

    it('date invoiceDate + 61d: 0', () => {
      const s = scoreInvoice(
        tx({ date: new Date('2026-03-03') }),
        invoice({ invoiceDate: new Date('2026-01-01') }),
        customer({ displayName: 'X' }),
      );
      expect(s.signals.datePlausible).toBe(false);
    });

    it('date one day BEFORE invoiceDate: 0', () => {
      const s = scoreInvoice(
        tx({ date: new Date('2025-12-31') }),
        invoice({ invoiceDate: new Date('2026-01-01') }),
        customer({ displayName: 'X' }),
      );
      expect(s.signals.datePlausible).toBe(false);
    });

    it('invoice status PARTIAL_PAID: +5', () => {
      const s = scoreInvoice(tx(), invoice({ status: 'PARTIAL_PAID' }), customer({ displayName: 'X' }));
      expect(s.signals.partialBonus).toBe(true);
    });

    it('invoice status SENT: no partial bonus', () => {
      const s = scoreInvoice(tx(), invoice({ status: 'SENT' }), customer({ displayName: 'X' }));
      expect(s.signals.partialBonus).toBe(false);
    });
  });

  describe('scoreInvoice — combinations', () => {
    it('all six signals fire: 60+40+15+10+5 = 130', () => {
      const d = new Date('2026-01-10');
      const s = scoreInvoice(
        tx({ description: 'INV-1011 OFFICE CLEANERS', unallocated: new Decimal('100.00'), date: d }),
        invoice({ invoiceNumber: 1011, amountOutstanding: new Decimal('100.00'), invoiceDate: new Date('2026-01-01'), status: 'PARTIAL_PAID' }),
        customer({ displayName: 'Office Cleaners Maddington' }),
      );
      expect(s.total).toBe(130);
    });

    it('case-insensitive customer token', () => {
      const s = scoreInvoice(
        tx({ description: 'PMT FROM OFFICE CLEANERS' }),
        invoice(),
        customer({ displayName: 'office cleaners' }),
      );
      expect(s.signals.customerToken).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run the spec, verify it fails**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=scoring.spec.ts
  ```
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

  Create `backend/src/payments/scoring.ts`:

  ```ts
  import { Decimal } from '@prisma/client/runtime/library';

  export interface ScoreTransaction {
    description: string;
    unallocated: Decimal;
    date: Date;
  }

  export interface ScoreInvoice {
    invoiceNumber: number;
    amountOutstanding: Decimal;
    invoiceDate: Date;
    status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'VOID';
  }

  export interface ScoreCustomer {
    displayName: string;
  }

  export interface ScoreSignals {
    invoiceNumber: boolean;
    exactAmount: boolean;
    customerToken: boolean;
    datePlausible: boolean;
    partialBonus: boolean;
  }

  export interface ScoreResult {
    total: number;
    signals: ScoreSignals;
  }

  const INVOICE_NUMBER_RE = /INV[-\s]?0*(\d{3,6})/i;
  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

  export function scoreInvoice(
    tx: ScoreTransaction,
    invoice: ScoreInvoice,
    customer: ScoreCustomer,
  ): ScoreResult {
    const signals: ScoreSignals = {
      invoiceNumber: false,
      exactAmount: false,
      customerToken: false,
      datePlausible: false,
      partialBonus: false,
    };

    // Signal 1: invoice number in description (+60)
    const m = tx.description.match(INVOICE_NUMBER_RE);
    if (m && Number(m[1]) === invoice.invoiceNumber) {
      signals.invoiceNumber = true;
    }

    // Signal 2: exact amount equality (+40)
    if (tx.unallocated.eq(invoice.amountOutstanding)) {
      signals.exactAmount = true;
    }

    // Signal 3: customer name token (length >= 4) substring match, case-insensitive (+15)
    const descLower = tx.description.toLowerCase();
    const tokens = customer.displayName.split(/\s+/).filter((t) => t.length >= 4);
    for (const t of tokens) {
      if (descLower.includes(t.toLowerCase())) {
        signals.customerToken = true;
        break;
      }
    }

    // Signal 4: date plausible — invoiceDate <= tx.date <= invoiceDate + 60d (+10)
    const txMs = tx.date.getTime();
    const invMs = invoice.invoiceDate.getTime();
    if (txMs >= invMs && txMs <= invMs + SIXTY_DAYS_MS) {
      signals.datePlausible = true;
    }

    // Signal 5: invoice already PARTIAL_PAID (+5)
    if (invoice.status === 'PARTIAL_PAID') {
      signals.partialBonus = true;
    }

    const total =
      (signals.invoiceNumber ? 60 : 0) +
      (signals.exactAmount ? 40 : 0) +
      (signals.customerToken ? 15 : 0) +
      (signals.datePlausible ? 10 : 0) +
      (signals.partialBonus ? 5 : 0);

    return { total, signals };
  }
  ```

- [ ] **Step 4: Run the spec, verify it passes**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=scoring.spec.ts
  ```
  Expected: PASS — all 16 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/payments/scoring.ts backend/src/payments/scoring.spec.ts
  git commit -m "feat(payments): scoreInvoice helper — six-signal deterministic scorer"
  ```

---

## Task 4: `findBundleSuggestion` helper + unit tests

Pure 2/3-invoice exact-sum search. Oldest-first ordering. Early-skip when >8 candidates.

**Files:**
- Create: `backend/src/payments/bundle.ts`
- Create: `backend/src/payments/bundle.spec.ts`

- [ ] **Step 1: Write the failing spec**

  Create `backend/src/payments/bundle.spec.ts`:

  ```ts
  import { Decimal } from '@prisma/client/runtime/library';
  import { findBundleSuggestion, type BundleInvoice } from './bundle';

  function inv(id: string, outstanding: string, invoiceDate: string): BundleInvoice {
    return { id, invoiceNumber: Number(id.replace(/\D/g, '')) || 1, amountOutstanding: new Decimal(outstanding), invoiceDate: new Date(invoiceDate) };
  }

  describe('findBundleSuggestion', () => {
    it('returns null when invoices array is empty', () => {
      expect(findBundleSuggestion(new Decimal('100'), [])).toBeNull();
    });

    it('returns null when no pair sums to target', () => {
      const r = findBundleSuggestion(new Decimal('500.00'), [inv('1', '100.00', '2026-01-01'), inv('2', '200.00', '2026-01-02')]);
      expect(r).toBeNull();
    });

    it('finds a 2-of-3 exact-sum bundle', () => {
      const r = findBundleSuggestion(new Decimal('300.00'), [
        inv('1', '100.00', '2026-01-01'),
        inv('2', '200.00', '2026-01-02'),
        inv('3', '50.00',  '2026-01-03'),
      ]);
      expect(r?.invoices.map((i) => i.id)).toEqual(['1', '2']);
      expect(r?.total.toString()).toBe('300');
    });

    it('finds a 3-of-3 exact-sum bundle when no pair works', () => {
      const r = findBundleSuggestion(new Decimal('350.00'), [
        inv('1', '100.00', '2026-01-01'),
        inv('2', '200.00', '2026-01-02'),
        inv('3', '50.00',  '2026-01-03'),
      ]);
      expect(r?.invoices.map((i) => i.id)).toEqual(['1', '2', '3']);
    });

    it('prefers the OLDEST combination on duplicate-amount sets', () => {
      const r = findBundleSuggestion(new Decimal('200.00'), [
        inv('1', '100.00', '2026-01-01'),
        inv('2', '100.00', '2026-01-02'),
        inv('3', '100.00', '2026-01-03'),
      ]);
      // Oldest pair is (1, 2).
      expect(r?.invoices.map((i) => i.id)).toEqual(['1', '2']);
    });

    it('excludes zero-outstanding invoices from the combinatorial set', () => {
      const r = findBundleSuggestion(new Decimal('100.00'), [
        inv('1', '0.00',   '2026-01-01'),
        inv('2', '60.00',  '2026-01-02'),
        inv('3', '40.00',  '2026-01-03'),
      ]);
      expect(r?.invoices.map((i) => i.id)).toEqual(['2', '3']);
    });

    it('returns null when there are more than 8 candidates (early skip)', () => {
      const many = Array.from({ length: 9 }, (_, i) =>
        inv(String(i + 1), '100.00', `2026-01-${String(i + 1).padStart(2, '0')}`),
      );
      // 100 * 2 = 200 would otherwise be findable.
      const r = findBundleSuggestion(new Decimal('200.00'), many);
      expect(r).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run the spec, verify it fails**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=bundle.spec.ts
  ```
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

  Create `backend/src/payments/bundle.ts`:

  ```ts
  import { Decimal } from '@prisma/client/runtime/library';

  export interface BundleInvoice {
    id: string;
    invoiceNumber: number;
    amountOutstanding: Decimal;
    invoiceDate: Date;
  }

  export interface BundleSuggestion {
    invoices: BundleInvoice[];
    total: Decimal;
  }

  const MAX_CANDIDATES = 8;

  export function findBundleSuggestion(
    target: Decimal,
    invoices: BundleInvoice[],
  ): BundleSuggestion | null {
    // Exclude zero-outstanding rows (they can't contribute to a sum).
    const pool = invoices
      .filter((i) => i.amountOutstanding.gt(0))
      .sort((a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime());

    if (pool.length === 0) return null;
    if (pool.length > MAX_CANDIDATES) return null;

    // 2-of-n combinations, oldest-first via the outer/inner index order.
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const sum = pool[i].amountOutstanding.add(pool[j].amountOutstanding);
        if (sum.eq(target)) {
          return { invoices: [pool[i], pool[j]], total: sum };
        }
      }
    }

    // 3-of-n combinations, oldest-first.
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        for (let k = j + 1; k < pool.length; k++) {
          const sum = pool[i].amountOutstanding
            .add(pool[j].amountOutstanding)
            .add(pool[k].amountOutstanding);
          if (sum.eq(target)) {
            return { invoices: [pool[i], pool[j], pool[k]], total: sum };
          }
        }
      }
    }

    return null;
  }
  ```

- [ ] **Step 4: Run the spec, verify it passes**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=bundle.spec.ts
  ```
  Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/payments/bundle.ts backend/src/payments/bundle.spec.ts
  git commit -m "feat(payments): findBundleSuggestion — 2/3-invoice exact-sum search"
  ```

---

## Task 5: Backfill module + integration test

Idempotent one-shot run by `PaymentsModule`'s `onModuleInit`. Populates `amountPaid` / `amountOutstanding` on existing invoices based on their pre-Phase-D status.

**Files:**
- Create: `backend/src/payments/backfill.ts`
- Create: `backend/src/payments/backfill.spec.ts`

- [ ] **Step 1: Write the failing spec**

  Create `backend/src/payments/backfill.spec.ts`:

  ```ts
  import { runPaymentsBackfill } from './backfill';

  function makePrisma() {
    const updates: any[] = [];
    return {
      _updates: updates,
      $executeRawUnsafe: jest.fn(async (sql: string) => {
        updates.push(sql);
        // Return rowcount for the call. First call: rowCount=2. Subsequent calls: 0.
        return updates.length === 1 ? 2 : 0;
      }),
    } as any;
  }

  describe('runPaymentsBackfill', () => {
    it('issues a single UPDATE matching the spec SQL', async () => {
      const prisma = makePrisma();
      await runPaymentsBackfill(prisma);
      expect(prisma._updates).toHaveLength(1);
      expect(prisma._updates[0]).toContain('UPDATE "Invoice"');
      expect(prisma._updates[0]).toContain('amountPaid');
      expect(prisma._updates[0]).toContain('amountOutstanding');
      expect(prisma._updates[0]).toContain('WHERE "amountPaid" = 0 AND "amountOutstanding" = 0');
    });

    it('is idempotent — second run does not write any new rows', async () => {
      const prisma = makePrisma();
      await runPaymentsBackfill(prisma);
      await runPaymentsBackfill(prisma);
      expect(prisma._updates).toHaveLength(2); // the SQL is fired twice, but the WHERE clause guards
    });
  });
  ```

- [ ] **Step 2: Run the spec, verify it fails**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=backfill.spec.ts
  ```
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the backfill**

  Create `backend/src/payments/backfill.ts`:

  ```ts
  import type { PrismaService } from '../prisma/prisma.service';

  // One-shot, idempotent backfill of denormalised payment columns.
  // The WHERE clause means a second run is a no-op on already-backfilled rows.
  // Called from PaymentsModule.onModuleInit.
  export async function runPaymentsBackfill(
    prisma: Pick<PrismaService, '$executeRawUnsafe'>,
  ): Promise<void> {
    await prisma.$executeRawUnsafe(`
      UPDATE "Invoice"
      SET "amountPaid"        = CASE WHEN status = 'PAID' THEN "totalAmount" ELSE 0 END,
          "amountOutstanding" = CASE WHEN status = 'PAID' THEN 0 ELSE "totalAmount" END
      WHERE "amountPaid" = 0 AND "amountOutstanding" = 0
    `);
  }
  ```

- [ ] **Step 4: Run the spec, verify it passes**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=backfill.spec.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/payments/backfill.ts backend/src/payments/backfill.spec.ts
  git commit -m "feat(payments): one-shot idempotent invoice payment backfill"
  ```

---

## Task 6: Payments module skeleton + DTOs + types

Scaffolding so subsequent tasks can land cleanly. `PaymentsService` is empty for now (filled by Tasks 7-11).

**Files:**
- Create: `backend/src/payments/payments.module.ts`
- Create: `backend/src/payments/types.ts`
- Create: `backend/src/payments/payments.dto.ts`

- [ ] **Step 1: Create `types.ts`**

  ```ts
  // backend/src/payments/types.ts

  export interface ScoredInvoiceView {
    id: string;
    invoiceNumber: number;
    invoiceDate: string;   // ISO date (yyyy-mm-dd)
    totalAmount: string;
    amountOutstanding: string;
    status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'VOID';
    customerId: string | null;
    customerName: string | null;
    score: number;
    signals: {
      invoiceNumber: boolean;
      exactAmount: boolean;
      customerToken: boolean;
      datePlausible: boolean;
      partialBonus: boolean;
    };
  }

  export interface BundleSuggestionView {
    invoiceIds: string[];
    invoices: Array<{ id: string; invoiceNumber: number; amountOutstanding: string }>;
    total: string;
  }

  export interface CandidatesResponse {
    candidates: ScoredInvoiceView[];
    bundleSuggestion: BundleSuggestionView | null;
  }

  export interface PaymentQueueItem {
    id: string;
    date: string;
    amount: string;
    description: string;
    accountId: string;
    accountName: string;
    vendorId: string | null;
    vendorName: string | null;
    vendorCustomerId: string | null;
    vendorCustomerName: string | null;
    unallocated: string;
  }

  export interface AllocationView {
    id: string;
    transactionId: string;
    invoiceId: string;
    amount: string;
    createdAt: string;
    transactionDate: string;
    transactionDescription: string;
  }

  export interface CustomerCreditView {
    credit: string;
    transactions: Array<{
      id: string;
      date: string;
      amount: string;
      remaining: string;
      description: string;
    }>;
  }

  export interface ApplyResponse {
    transaction: {
      id: string;
      amount: string;
      unallocated: string;
    };
    invoices: Array<{
      id: string;
      status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'VOID';
      amountPaid: string;
      amountOutstanding: string;
    }>;
  }
  ```

- [ ] **Step 2: Create `payments.dto.ts`**

  ```ts
  // backend/src/payments/payments.dto.ts
  import { Type } from 'class-transformer';
  import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDefined,
    IsNumberString,
    IsObject,
    IsOptional,
    IsUUID,
    ValidateNested,
  } from 'class-validator';

  export class AllocationLineDto {
    @IsUUID() invoiceId!: string;
    // Decimal-as-string per existing convention (Prisma Decimal columns serialise to string).
    @IsNumberString() amount!: string;
  }

  export class ApplyPaymentDto {
    @IsUUID() transactionId!: string;

    // ValidationPipe runs with whitelist: true — every nested array element needs
    // class-validator decorators or the contents are silently stripped. The
    // @ValidateNested + @Type combo handles the array; each AllocationLineDto
    // field is decorated above.
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => AllocationLineDto)
    allocations!: AllocationLineDto[];

    @IsUUID() @IsOptional() bindVendorToCustomerId?: string;
  }

  export class QueueQueryDto {
    @IsBoolean() @IsOptional() showAll?: boolean;
  }
  ```

- [ ] **Step 3: Create `payments.module.ts` with the lifecycle hook**

  ```ts
  // backend/src/payments/payments.module.ts
  import { Module, OnModuleInit } from '@nestjs/common';
  import { PrismaModule } from '../prisma/prisma.module';
  import { PrismaService } from '../prisma/prisma.service';
  import { runPaymentsBackfill } from './backfill';

  @Module({
    imports: [PrismaModule],
    providers: [],
    controllers: [],
    exports: [],
  })
  export class PaymentsModule implements OnModuleInit {
    constructor(private prisma: PrismaService) {}
    async onModuleInit() {
      // One-shot, idempotent. The WHERE clause inside the SQL guards against re-running.
      await runPaymentsBackfill(this.prisma);
    }
  }
  ```

- [ ] **Step 4: Register the module in `AppModule`**

  Edit `backend/src/app.module.ts`. Add the import alongside the others:

  ```ts
  import { PaymentsModule } from './payments/payments.module';
  ```

  Add `PaymentsModule` to the `imports` array (anywhere after `PrismaModule`).

- [ ] **Step 5: Rebuild backend, verify boot succeeds**

  ```bash
  docker compose build backend && docker compose up -d backend
  docker logs simplebooks-backend-1 --tail=50
  ```
  Expected: "Application is running" and no errors from `runPaymentsBackfill`. Then verify the backfill ran:

  ```bash
  docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'SELECT status, "amountPaid", "amountOutstanding" FROM "Invoice" LIMIT 5;'
  ```
  Expected: rows show non-zero `amountOutstanding` for SENT/VIEWED invoices and `amountPaid` = `totalAmount` for PAID ones.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/payments/payments.module.ts backend/src/payments/types.ts backend/src/payments/payments.dto.ts backend/src/app.module.ts
  git commit -m "feat(payments): module skeleton + DTOs + types + backfill lifecycle hook"
  ```

---

## Task 7: `PaymentsService.getCandidates` + integration test

Composes `scoreInvoice` + `findBundleSuggestion`. Pure read path — no writes.

**Files:**
- Modify: `backend/src/payments/payments.module.ts` (register service)
- Create: `backend/src/payments/payments.service.ts`
- Create: `backend/src/payments/payments.service.spec.ts` (integration via in-memory Prisma double)

- [ ] **Step 1: Write the failing spec for `getCandidates`**

  Create `backend/src/payments/payments.service.spec.ts`:

  ```ts
  import { Decimal } from '@prisma/client/runtime/library';
  import { PaymentsService } from './payments.service';

  // Hand-rolled Prisma double. Each test populates the in-memory tables.
  function makePrisma(state: any) {
    const find = <T>(arr: T[], where: any): T | undefined =>
      arr.find((row: any) => Object.entries(where).every(([k, v]) => row[k] === v));
    return {
      _state: state,
      transaction: {
        findUnique: jest.fn(async ({ where }) => {
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
  ```

- [ ] **Step 2: Run the spec, verify it fails**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=payments.service.spec.ts
  ```
  Expected: FAIL — module `./payments.service` not found.

- [ ] **Step 3: Implement `PaymentsService` with `getCandidates` only**

  Create `backend/src/payments/payments.service.ts`:

  ```ts
  import { Injectable, NotFoundException } from '@nestjs/common';
  import { Decimal } from '@prisma/client/runtime/library';
  import { PrismaService } from '../prisma/prisma.service';
  import { scoreInvoice } from './scoring';
  import { findBundleSuggestion } from './bundle';
  import type { CandidatesResponse, ScoredInvoiceView } from './types';

  const OPEN_STATUSES = ['SENT', 'VIEWED', 'PARTIAL_PAID'] as const;

  @Injectable()
  export class PaymentsService {
    constructor(private prisma: PrismaService) {}

    async getCandidates(transactionId: string): Promise<CandidatesResponse> {
      const tx = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          allocations: true,
          vendor: true,
          account: true,
        } as any,
      });
      if (!tx) throw new NotFoundException('Transaction not found');

      const allocSum = (tx as any).allocations.reduce(
        (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
        new Decimal(0),
      );
      const unallocated = new Decimal((tx as any).amount.toString()).sub(allocSum);

      const customerId: string | null = (tx as any).vendor?.customerId ?? null;
      if (!customerId) {
        return { candidates: [], bundleSuggestion: null };
      }

      const invoices = await this.prisma.invoice.findMany({
        where: { customerId, status: { in: OPEN_STATUSES as any } },
      } as any);

      const candidates: ScoredInvoiceView[] = invoices.map((inv: any) => {
        const score = scoreInvoice(
          {
            description: (tx as any).description,
            unallocated,
            date: (tx as any).date,
          },
          {
            invoiceNumber: inv.invoiceNumber,
            amountOutstanding: new Decimal(inv.amountOutstanding.toString()),
            invoiceDate: inv.invoiceDate,
            status: inv.status,
          },
          { displayName: inv.customer?.name ?? '' },
        );
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate.toISOString().slice(0, 10),
          totalAmount: inv.totalAmount.toString(),
          amountOutstanding: inv.amountOutstanding.toString(),
          status: inv.status,
          customerId: inv.customerId,
          customerName: inv.customer?.name ?? null,
          score: score.total,
          signals: score.signals,
        };
      });
      candidates.sort((a, b) => b.score - a.score);

      const bundle = findBundleSuggestion(
        unallocated,
        invoices.map((inv: any) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amountOutstanding: new Decimal(inv.amountOutstanding.toString()),
          invoiceDate: inv.invoiceDate,
        })),
      );

      return {
        candidates,
        bundleSuggestion: bundle && {
          invoiceIds: bundle.invoices.map((i) => i.id),
          invoices: bundle.invoices.map((i) => ({
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            amountOutstanding: i.amountOutstanding.toString(),
          })),
          total: bundle.total.toString(),
        },
      };
    }
  }
  ```

- [ ] **Step 4: Register the service in `PaymentsModule`**

  Edit `backend/src/payments/payments.module.ts`. Add the import and register the provider:

  ```ts
  import { PaymentsService } from './payments.service';
  ```

  And update the decorator:

  ```ts
  @Module({
    imports: [PrismaModule],
    providers: [PaymentsService],
    controllers: [],
    exports: [PaymentsService],
  })
  ```

- [ ] **Step 5: Run the spec, verify it passes**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=payments.service.spec.ts
  ```
  Expected: PASS — 3 tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/payments/payments.service.ts backend/src/payments/payments.service.spec.ts backend/src/payments/payments.module.ts
  git commit -m "feat(payments): PaymentsService.getCandidates with scoring + bundle suggestion"
  ```

---

## Task 8: `PaymentsService.applyAllocations` + integration tests

The write path: one Prisma transaction, all conservation invariants enforced, `recomputeInvoicePayment` per affected invoice, `AllocationEvent{CREATED}` per line, optional vendor binding. Returns updated transaction + invoices.

**Files:**
- Modify: `backend/src/payments/payments.service.ts`
- Modify: `backend/src/payments/payments.service.spec.ts`

- [ ] **Step 1: Extend the Prisma double in the spec to cover writes**

  Append to `backend/src/payments/payments.service.spec.ts`:

  ```ts
  // ---------- write-path Prisma double ----------
  function makeWritePrisma(state: any) {
    const find = <T>(arr: T[], where: any): T | undefined =>
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
      const byId = (id: string) => state.invoices.find((i: any) => i.id === id);
      expect(byId('i1').status).toBe('PAID');
      expect(byId('i2').status).toBe('PARTIAL_PAID');
      expect(byId('i3').status).toBe('PAID');
      expect(state.events.filter((e: any) => e.eventType === 'CREATED')).toHaveLength(3);
      expect(r.invoices).toHaveLength(3);
    });

    it('partial payment leaves PARTIAL_PAID + remaining unallocated stays as credit', async () => {
      const state = baseState();
      seedInvoice(state, { id: 'i1', totalAmount: '100.00' });
      const prisma = makeWritePrisma(state);
      const svc = new PaymentsService(prisma);
      await svc.applyAllocations('tx1', [{ invoiceId: 'i1', amount: '40.00' }]);
      const inv = state.invoices.find((i: any) => i.id === 'i1');
      expect(inv.status).toBe('PARTIAL_PAID');
      expect(inv.amountOutstanding.toString()).toBe('60');
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
      state.vendors[0].customerId = null; // unlinked
      seedInvoice(state, { id: 'i1', totalAmount: '100.00' });
      const prisma = makeWritePrisma(state);
      const svc = new PaymentsService(prisma);
      await svc.applyAllocations('tx1', [{ invoiceId: 'i1', amount: '100.00' }], 'c1');
      expect(state.vendors[0].customerId).toBe('c1');
    });
  });
  ```

- [ ] **Step 2: Run the spec, verify it fails**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=payments.service.spec.ts
  ```
  Expected: FAIL — `applyAllocations` is not a function.

- [ ] **Step 3: Implement `applyAllocations`**

  Append to `backend/src/payments/payments.service.ts` (inside the class):

  ```ts
    async applyAllocations(
      transactionId: string,
      allocations: Array<{ invoiceId: string; amount: string }>,
      bindVendorToCustomerId?: string,
    ): Promise<import('./types').ApplyResponse> {
      if (allocations.length === 0) {
        // class-validator's ArrayMinSize catches this at the controller; defensive guard here too.
        throw new BadRequestException('allocations must not be empty');
      }
      // Per-line positivity guard runs before opening the transaction so the
      // BadRequest fires cleanly.
      for (const a of allocations) {
        if (!new Decimal(a.amount).gt(0)) {
          throw new BadRequestException('allocation amount must be > 0');
        }
      }

      return this.prisma.$transaction(async (db: any) => {
        const tx = await db.transaction.findUnique({
          where: { id: transactionId },
          include: { allocations: true, vendor: true, account: true },
        });
        if (!tx) throw new NotFoundException('Transaction not found');

        const existingAllocSum = tx.allocations.reduce(
          (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
          new Decimal(0),
        );
        const unallocated = new Decimal(tx.amount.toString()).sub(existingAllocSum);

        const newSum = allocations.reduce(
          (acc, a) => acc.add(new Decimal(a.amount)),
          new Decimal(0),
        );
        if (newSum.gt(unallocated)) {
          throw new BadRequestException(
            `Allocations sum (${newSum.toString()}) exceeds transaction unallocated (${unallocated.toString()})`,
          );
        }

        // Pull all targeted invoices in one query for status + outstanding checks.
        const invoiceIds = allocations.map((a) => a.invoiceId);
        const invoices = await db.invoice.findMany({ where: { id: { in: invoiceIds } } });
        if (invoices.length !== invoiceIds.length) {
          throw new NotFoundException('One or more invoices not found');
        }
        const invById = new Map<string, any>(invoices.map((i: any) => [i.id, i]));

        for (const line of allocations) {
          const inv = invById.get(line.invoiceId)!;
          if (!OPEN_STATUSES.includes(inv.status)) {
            // 409 — caller's view of the candidate set is stale. Controller maps NotFound vs Conflict;
            // here we throw a typed error and let the controller decide. PAID/VOID are conflicts,
            // DRAFT is bad-request (never a candidate to begin with).
            if (inv.status === 'PAID' || inv.status === 'VOID') {
              throw new ConflictException(`Invoice ${inv.invoiceNumber} status is ${inv.status}`);
            }
            throw new BadRequestException(`Invoice ${inv.invoiceNumber} status is ${inv.status}`);
          }
          const lineAmount = new Decimal(line.amount);
          const outstanding = new Decimal(inv.amountOutstanding.toString());
          if (lineAmount.gt(outstanding)) {
            throw new BadRequestException(
              `Allocation ${lineAmount.toString()} exceeds invoice ${inv.invoiceNumber} outstanding ${outstanding.toString()}`,
            );
          }
        }

        // All checks passed — write rows.
        const affectedInvoiceIds = new Set<string>();
        for (const line of allocations) {
          const inv = invById.get(line.invoiceId)!;
          const statusBefore = inv.status;
          await db.allocation.create({
            data: { transactionId, invoiceId: line.invoiceId, amount: new Decimal(line.amount) },
          });
          // Recompute this invoice immediately so the next iteration sees the new outstanding
          // if the same invoice is touched twice (rare, but possible per spec §10).
          const allocs = await db.allocation.findMany({ where: { invoiceId: line.invoiceId } });
          const { amountPaid, amountOutstanding, status } = recomputeInvoicePayment(
            {
              status: inv.status,
              totalAmount: new Decimal(inv.totalAmount.toString()),
              viewedAt: inv.viewedAt,
              sendAttempts: inv.sendAttempts ?? 0,
            },
            allocs.map((a: any) => ({ amount: new Decimal(a.amount.toString()) })),
          );
          await db.invoice.update({
            where: { id: line.invoiceId },
            data: { amountPaid, amountOutstanding, status },
          });
          inv.status = status;
          inv.amountPaid = amountPaid;
          inv.amountOutstanding = amountOutstanding;
          await db.allocationEvent.create({
            data: {
              eventType: 'CREATED',
              transactionId,
              invoiceId: line.invoiceId,
              amount: new Decimal(line.amount),
              invoiceStatusBefore: statusBefore,
              invoiceStatusAfter: status,
            },
          });
          affectedInvoiceIds.add(line.invoiceId);
        }

        if (bindVendorToCustomerId && tx.vendor?.id) {
          await db.vendor.update({
            where: { id: tx.vendor.id },
            data: { customerId: bindVendorToCustomerId },
          });
        }

        const updatedInvoices = Array.from(affectedInvoiceIds).map((id) => {
          const inv = invById.get(id)!;
          return {
            id,
            status: inv.status,
            amountPaid: inv.amountPaid.toString(),
            amountOutstanding: inv.amountOutstanding.toString(),
          };
        });
        const newUnallocated = unallocated.sub(newSum);
        return {
          transaction: {
            id: tx.id,
            amount: tx.amount.toString(),
            unallocated: newUnallocated.toString(),
          },
          invoices: updatedInvoices,
        };
      });
    }
  ```

  And at the top of the file, expand the imports:

  ```ts
  import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
  import { Decimal } from '@prisma/client/runtime/library';
  import { PrismaService } from '../prisma/prisma.service';
  import { scoreInvoice } from './scoring';
  import { findBundleSuggestion } from './bundle';
  import { recomputeInvoicePayment } from './recompute';
  import type { CandidatesResponse, ScoredInvoiceView } from './types';
  ```

- [ ] **Step 4: Run the spec, verify it passes**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=payments.service.spec.ts
  ```
  Expected: PASS — all `applyAllocations` tests plus the earlier `getCandidates` tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/payments/payments.service.ts backend/src/payments/payments.service.spec.ts
  git commit -m "feat(payments): applyAllocations — single-transaction write path with conservation checks"
  ```

---

## Task 9: `PaymentsService.deleteAllocation` + integration tests

Hard-delete one Allocation, recompute its invoice, emit `AllocationEvent{DELETED}` with the snapshot fields. All in one Prisma transaction.

**Files:**
- Modify: `backend/src/payments/payments.service.ts`
- Modify: `backend/src/payments/payments.service.spec.ts`

- [ ] **Step 1: Append the failing spec block**

  Append to `backend/src/payments/payments.service.spec.ts`:

  ```ts
  describe('PaymentsService.deleteAllocation', () => {
    function seededPaid() {
      const state: any = {
        accounts: [{ id: 'acc1', name: 'Op' }],
        customers: [{ id: 'c1', name: 'Cust' }],
        vendors: [{ id: 'v1', name: 'V', customerId: 'c1' }],
        transactions: [{ id: 'tx1', accountId: 'acc1', vendorId: 'v1', amount: new Decimal('100.00'), description: 'pmt', date: new Date('2026-01-10') }],
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
      // Replace single 100 with two 50s on the same invoice.
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
  ```

- [ ] **Step 2: Run the spec, verify it fails**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=payments.service.spec.ts
  ```
  Expected: FAIL — `deleteAllocation` is not a function.

- [ ] **Step 3: Implement `deleteAllocation`**

  Append to the `PaymentsService` class in `backend/src/payments/payments.service.ts`:

  ```ts
    async deleteAllocation(allocationId: string): Promise<void> {
      await this.prisma.$transaction(async (db: any) => {
        const alloc = await db.allocation.findUnique({ where: { id: allocationId } });
        if (!alloc) throw new NotFoundException('Allocation not found');

        const inv = await db.invoice.findUnique({ where: { id: alloc.invoiceId } });
        if (!inv) throw new NotFoundException('Invoice not found');

        const statusBefore = inv.status;
        const snapshot = {
          transactionId: alloc.transactionId,
          invoiceId: alloc.invoiceId,
          amount: new Decimal(alloc.amount.toString()),
        };

        await db.allocation.delete({ where: { id: allocationId } });

        const remaining = await db.allocation.findMany({ where: { invoiceId: alloc.invoiceId } });
        const { amountPaid, amountOutstanding, status } = recomputeInvoicePayment(
          {
            status: inv.status,
            totalAmount: new Decimal(inv.totalAmount.toString()),
            viewedAt: inv.viewedAt,
            sendAttempts: inv.sendAttempts ?? 0,
          },
          remaining.map((a: any) => ({ amount: new Decimal(a.amount.toString()) })),
        );
        await db.invoice.update({
          where: { id: alloc.invoiceId },
          data: { amountPaid, amountOutstanding, status },
        });

        await db.allocationEvent.create({
          data: {
            eventType: 'DELETED',
            transactionId: snapshot.transactionId,
            invoiceId: snapshot.invoiceId,
            amount: snapshot.amount,
            invoiceStatusBefore: statusBefore,
            invoiceStatusAfter: status,
          },
        });
      });
    }
  ```

- [ ] **Step 4: Run the spec, verify it passes**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=payments.service.spec.ts
  ```
  Expected: PASS — all `deleteAllocation` tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/payments/payments.service.ts backend/src/payments/payments.service.spec.ts
  git commit -m "feat(payments): deleteAllocation — recompute + DELETED audit event"
  ```

---

## Task 10: Queue + dismiss/undismiss + count

Single task because all four share the same filter clause.

**Files:**
- Modify: `backend/src/payments/payments.service.ts`
- Modify: `backend/src/payments/payments.service.spec.ts`

- [ ] **Step 1: Append the failing spec block**

  Append to `backend/src/payments/payments.service.spec.ts`:

  ```ts
  describe('PaymentsService.getQueue / getQueueCount', () => {
    function baseQueueState() {
      return {
        accounts: [{ id: 'acc1', name: 'Operating' }],
        customers: [{ id: 'c1', name: 'Cust' }],
        vendors: [
          { id: 'v1', name: 'V1', customerId: 'c1' },
          { id: 'v2', name: 'V2', customerId: null },
        ],
        categories: [
          { id: 'cat-inc', name: 'Sales', kind: 'INCOME' },
          { id: 'cat-int', name: 'Interest', kind: 'INCOME' }, // INCOME kind but excluded by ?showAll filter — included by default
          { id: 'cat-exp', name: 'Office', kind: 'EXPENSE' },
        ],
        transactions: [
          { id: 'tx-inc', accountId: 'acc1', vendorId: 'v1', categoryId: 'cat-inc', amount: new Decimal('100.00'), description: 'paid', date: new Date('2026-01-10'), paymentReviewDismissedAt: null },
          { id: 'tx-exp', accountId: 'acc1', vendorId: 'v2', categoryId: 'cat-exp', amount: new Decimal('50.00'),  description: 'cleaning', date: new Date('2026-01-11'), paymentReviewDismissedAt: null },
          { id: 'tx-neg', accountId: 'acc1', vendorId: 'v1', categoryId: 'cat-inc', amount: new Decimal('-20.00'), description: 'refund', date: new Date('2026-01-12'), paymentReviewDismissedAt: null },
          { id: 'tx-dis', accountId: 'acc1', vendorId: 'v1', categoryId: 'cat-inc', amount: new Decimal('60.00'),  description: 'dismissed', date: new Date('2026-01-13'), paymentReviewDismissedAt: new Date() },
          { id: 'tx-full', accountId: 'acc1', vendorId: 'v1', categoryId: 'cat-inc', amount: new Decimal('40.00'), description: 'fully-allocated', date: new Date('2026-01-14'), paymentReviewDismissedAt: null },
        ],
        invoices: [],
        allocations: [
          { id: 'a-full', transactionId: 'tx-full', invoiceId: 'i-stub', amount: new Decimal('40.00'), createdAt: new Date() },
        ],
        events: [],
      };
    }

    function makeQueuePrisma(state: any) {
      const find = <T>(arr: T[], where: any): T | undefined =>
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
              .map((t: any) => ({
                ...t,
                account: find(state.accounts, { id: t.accountId }),
                vendor: t.vendorId ? find(state.vendors, { id: t.vendorId }) : null,
                allocations: state.allocations.filter((a: any) => a.transactionId === t.id),
              }));
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
      state.transactions[0].paymentReviewDismissedAt = new Date(); // pre-dismissed
      const svc = new PaymentsService(makeQueuePrisma(state));
      await svc.undismiss('tx-inc');
      const list = await svc.getQueue({ showAll: false });
      expect(list.map((x) => x.id)).toContain('tx-inc');
    });
  });
  ```

- [ ] **Step 2: Run the spec, verify it fails**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=payments.service.spec.ts
  ```
  Expected: FAIL — `getQueue` is not a function.

- [ ] **Step 3: Implement the queue methods**

  Append to the `PaymentsService` class in `backend/src/payments/payments.service.ts`:

  ```ts
    async getQueue(opts: { showAll?: boolean }): Promise<import('./types').PaymentQueueItem[]> {
      const where: any = { paymentReviewDismissedAt: null };
      if (!opts.showAll) where.category = { kind: 'INCOME' };
      const rows = await this.prisma.transaction.findMany({
        where,
        include: { account: true, vendor: { include: { customer: true } }, allocations: true } as any,
        orderBy: { date: 'desc' },
      } as any);
      return (rows as any[])
        .filter((t) => new Decimal(t.amount.toString()).gt(0))
        .map((t) => {
          const allocSum = (t.allocations ?? []).reduce(
            (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
            new Decimal(0),
          );
          const unallocated = new Decimal(t.amount.toString()).sub(allocSum);
          return {
            id: t.id,
            date: t.date.toISOString().slice(0, 10),
            amount: t.amount.toString(),
            description: t.description,
            accountId: t.accountId,
            accountName: t.account?.name ?? '',
            vendorId: t.vendorId ?? null,
            vendorName: t.vendor?.name ?? null,
            vendorCustomerId: t.vendor?.customerId ?? null,
            vendorCustomerName: t.vendor?.customer?.name ?? null,
            unallocated: unallocated.toString(),
          };
        })
        .filter((r) => new Decimal(r.unallocated).gt(0));
    }

    async getQueueCount(opts: { showAll?: boolean }): Promise<{ count: number }> {
      const list = await this.getQueue(opts);
      return { count: list.length };
    }

    async dismiss(transactionId: string): Promise<void> {
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { paymentReviewDismissedAt: new Date() },
      } as any);
    }

    async undismiss(transactionId: string): Promise<void> {
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { paymentReviewDismissedAt: null },
      } as any);
    }
  ```

- [ ] **Step 4: Run the spec, verify it passes**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=payments.service.spec.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/payments/payments.service.ts backend/src/payments/payments.service.spec.ts
  git commit -m "feat(payments): queue + dismiss/undismiss + count"
  ```

---

## Task 11: `PaymentsService.getCustomerCredit`

Computes the derived credit view per spec §6 using Prisma `$queryRaw`.

**Files:**
- Modify: `backend/src/payments/payments.service.ts`
- Modify: `backend/src/payments/payments.service.spec.ts`

- [ ] **Step 1: Append the failing spec**

  Append to `backend/src/payments/payments.service.spec.ts`:

  ```ts
  describe('PaymentsService.getCustomerCredit', () => {
    it('sums remaining across transactions for vendors linked to the customer', async () => {
      // queryRaw is mocked to return what the SQL would compute for the seeded state.
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
  ```

- [ ] **Step 2: Run the spec, verify it fails**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=payments.service.spec.ts
  ```
  Expected: FAIL — `getCustomerCredit` is not a function.

- [ ] **Step 3: Implement `getCustomerCredit`**

  Append to the `PaymentsService` class:

  ```ts
    async getCustomerCredit(customerId: string): Promise<import('./types').CustomerCreditView> {
      const rows: Array<{ id: string; date: Date; amount: Decimal; description: string; remaining: Decimal }> =
        await this.prisma.$queryRaw`
          SELECT
            t.id, t.date, t.amount, t.description,
            t.amount - COALESCE(SUM(a.amount), 0) AS remaining
          FROM "Transaction" t
          JOIN "Vendor" v ON v.id = t."vendorId"
          LEFT JOIN "Allocation" a ON a."transactionId" = t.id
          WHERE v."customerId" = ${customerId}
            AND t.amount > 0
          GROUP BY t.id
          HAVING t.amount - COALESCE(SUM(a.amount), 0) > 0
          ORDER BY t.date DESC
        ` as any;
      const total = rows.reduce(
        (acc, r) => acc.add(new Decimal(r.remaining.toString())),
        new Decimal(0),
      );
      return {
        credit: total.toString(),
        transactions: rows.map((r) => ({
          id: r.id,
          date: r.date.toISOString().slice(0, 10),
          amount: r.amount.toString(),
          remaining: r.remaining.toString(),
          description: r.description,
        })),
      };
    }
  ```

- [ ] **Step 4: Run the spec, verify it passes**

  ```bash
  docker exec simplebooks-backend-1 npm test -- --testPathPattern=payments.service.spec.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/payments/payments.service.ts backend/src/payments/payments.service.spec.ts
  git commit -m "feat(payments): getCustomerCredit derived view"
  ```

---

## Task 12: `PaymentsController` + mount `/customers/:id/credit`

Wires every endpoint from spec §4. No business logic — pure delegation.

**Files:**
- Create: `backend/src/payments/payments.controller.ts`
- Modify: `backend/src/payments/payments.module.ts`
- Modify: `backend/src/customers/customers.controller.ts`
- Modify: `backend/src/customers/customers.module.ts`

- [ ] **Step 1: Create the controller**

  Create `backend/src/payments/payments.controller.ts`:

  ```ts
  import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
  import { PaymentsService } from './payments.service';
  import { ApplyPaymentDto } from './payments.dto';

  @Controller('payments')
  export class PaymentsController {
    constructor(private payments: PaymentsService) {}

    @Get('queue')
    queue(@Query('showAll') showAll?: string) {
      return this.payments.getQueue({ showAll: showAll === 'true' });
    }

    @Get('queue/count')
    queueCount(@Query('showAll') showAll?: string) {
      return this.payments.getQueueCount({ showAll: showAll === 'true' });
    }

    @Get('candidates/:transactionId')
    candidates(@Param('transactionId', new ParseUUIDPipe()) transactionId: string) {
      return this.payments.getCandidates(transactionId);
    }

    @Post('apply')
    @HttpCode(200)
    apply(@Body() dto: ApplyPaymentDto) {
      return this.payments.applyAllocations(
        dto.transactionId,
        dto.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
        dto.bindVendorToCustomerId,
      );
    }

    @Delete('allocations/:id')
    @HttpCode(204)
    async deleteAllocation(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
      await this.payments.deleteAllocation(id);
    }

    @Post('dismiss/:transactionId')
    @HttpCode(204)
    async dismiss(@Param('transactionId', new ParseUUIDPipe()) transactionId: string): Promise<void> {
      await this.payments.dismiss(transactionId);
    }

    @Post('undismiss/:transactionId')
    @HttpCode(204)
    async undismiss(@Param('transactionId', new ParseUUIDPipe()) transactionId: string): Promise<void> {
      await this.payments.undismiss(transactionId);
    }
  }
  ```

- [ ] **Step 2: Register the controller in `PaymentsModule`**

  Edit `backend/src/payments/payments.module.ts` — add `PaymentsController` to imports and the `controllers` array:

  ```ts
  import { PaymentsController } from './payments.controller';
  ```

  ```ts
  @Module({
    imports: [PrismaModule],
    providers: [PaymentsService],
    controllers: [PaymentsController],
    exports: [PaymentsService],
  })
  ```

- [ ] **Step 3: Wire `GET /customers/:id/credit`**

  Open `backend/src/customers/customers.controller.ts`. Add a method that delegates to `PaymentsService.getCustomerCredit`:

  ```ts
  // Add to the imports at the top:
  import { PaymentsService } from '../payments/payments.service';

  // Update the constructor signature to inject PaymentsService alongside the existing service.
  // Add this method anywhere inside the controller class:
  @Get(':id/credit')
  credit(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.payments.getCustomerCredit(id);
  }
  ```

  (If `Get` / `Param` / `ParseUUIDPipe` aren't already imported from `@nestjs/common`, add them. Verify by reading the existing imports first.)

- [ ] **Step 4: Import `PaymentsModule` into `CustomersModule`**

  Edit `backend/src/customers/customers.module.ts`. Add:

  ```ts
  import { PaymentsModule } from '../payments/payments.module';
  ```

  Add `PaymentsModule` to the `imports` array.

- [ ] **Step 5: Rebuild backend and smoke-test the endpoints**

  ```bash
  docker compose build backend && docker compose up -d backend
  ```

  Then hit the endpoints:

  ```bash
  curl -s http://localhost:4000/payments/queue/count
  curl -s http://localhost:4000/payments/queue
  ```

  Expected: `{"count":0}` (no income transactions seeded yet) and `[]`. No 500s in `docker logs simplebooks-backend-1 --tail=30`.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/payments/payments.controller.ts backend/src/payments/payments.module.ts backend/src/customers/customers.controller.ts backend/src/customers/customers.module.ts
  git commit -m "feat(payments): controller + /customers/:id/credit endpoint"
  ```

---

## Task 13: Frontend lib + types

Add API wrappers and TS types. No UI yet — just the boundary.

**Files:**
- Create: `frontend/lib/payments.ts`
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Extend `frontend/lib/types.ts`**

  Open the file. Find the existing `Invoice` type and add the two denormalised columns. Find the existing `Vendor` type and add `customerId`. Find the existing `InvoiceStatus` union and add `'PARTIAL_PAID'`. Then append the new types:

  ```ts
  // === Payments (Phase D) ===

  export type Allocation = {
    id: string;
    transactionId: string;
    invoiceId: string;
    amount: string;        // Decimal as string
    createdAt: string;
  };

  export type AllocationEvent = {
    id: string;
    eventType: 'CREATED' | 'DELETED';
    transactionId: string;
    invoiceId: string;
    amount: string;
    invoiceStatusBefore: InvoiceStatus;
    invoiceStatusAfter: InvoiceStatus;
    source: 'USER';
    createdAt: string;
  };

  export type ScoredInvoice = {
    id: string;
    invoiceNumber: number;
    invoiceDate: string;
    totalAmount: string;
    amountOutstanding: string;
    status: InvoiceStatus;
    customerId: string | null;
    customerName: string | null;
    score: number;
    signals: {
      invoiceNumber: boolean;
      exactAmount: boolean;
      customerToken: boolean;
      datePlausible: boolean;
      partialBonus: boolean;
    };
  };

  export type BundleSuggestion = {
    invoiceIds: string[];
    invoices: Array<{ id: string; invoiceNumber: number; amountOutstanding: string }>;
    total: string;
  };

  export type CandidatesResponse = {
    candidates: ScoredInvoice[];
    bundleSuggestion: BundleSuggestion | null;
  };

  export type CustomerCredit = {
    credit: string;
    transactions: Array<{
      id: string;
      date: string;
      amount: string;
      remaining: string;
      description: string;
    }>;
  };

  export type PaymentQueueItem = {
    id: string;
    date: string;
    amount: string;
    description: string;
    accountId: string;
    accountName: string;
    vendorId: string | null;
    vendorName: string | null;
    vendorCustomerId: string | null;
    vendorCustomerName: string | null;
    unallocated: string;
  };

  export type ApplyPaymentResponse = {
    transaction: { id: string; amount: string; unallocated: string };
    invoices: Array<{
      id: string;
      status: InvoiceStatus;
      amountPaid: string;
      amountOutstanding: string;
    }>;
  };
  ```

  In the existing `Invoice` type, add:

  ```ts
    amountPaid: string;
    amountOutstanding: string;
  ```

  In the existing `Vendor` type, add:

  ```ts
    customerId: string | null;
  ```

  In the existing `InvoiceStatus` union, add `'PARTIAL_PAID'` so it reads:

  ```ts
  export type InvoiceStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PARTIAL_PAID' | 'PAID' | 'VOID' | 'FAILED_TO_SEND';
  ```

- [ ] **Step 2: Create `frontend/lib/payments.ts`**

  ```ts
  import { api } from "./api";
  import type {
    ApplyPaymentResponse,
    CandidatesResponse,
    CustomerCredit,
    PaymentQueueItem,
  } from "./types";

  export function listPaymentsQueue(showAll = false): Promise<PaymentQueueItem[]> {
    return api<PaymentQueueItem[]>(`/payments/queue${showAll ? "?showAll=true" : ""}`);
  }

  export function paymentsQueueCount(showAll = false): Promise<{ count: number }> {
    return api<{ count: number }>(`/payments/queue/count${showAll ? "?showAll=true" : ""}`);
  }

  export function getCandidates(transactionId: string): Promise<CandidatesResponse> {
    return api<CandidatesResponse>(`/payments/candidates/${transactionId}`);
  }

  export function applyPayment(body: {
    transactionId: string;
    allocations: Array<{ invoiceId: string; amount: string }>;
    bindVendorToCustomerId?: string;
  }): Promise<ApplyPaymentResponse> {
    return api<ApplyPaymentResponse>("/payments/apply", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  export function deleteAllocation(id: string): Promise<void> {
    return api<void>(`/payments/allocations/${id}`, { method: "DELETE" });
  }

  export function dismissPayment(transactionId: string): Promise<void> {
    return api<void>(`/payments/dismiss/${transactionId}`, { method: "POST" });
  }

  export function undismissPayment(transactionId: string): Promise<void> {
    return api<void>(`/payments/undismiss/${transactionId}`, { method: "POST" });
  }

  export function getCustomerCredit(customerId: string): Promise<CustomerCredit> {
    return api<CustomerCredit>(`/customers/${customerId}/credit`);
  }
  ```

- [ ] **Step 3: Rebuild frontend, verify no TS errors**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  docker logs simplebooks-frontend-1 --tail=50
  ```
  Expected: build completes without TS errors. If you see TS errors, fix them before moving on.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/lib/payments.ts frontend/lib/types.ts
  git commit -m "feat(frontend): payments API client + types"
  ```

---

## Task 14: Vendor form — Customer linkage

Adds a Customer Select to the vendor edit form. Backend needs `customerId` allowed on `UpdateVendorDto`.

**Files:**
- Modify: `backend/src/vendors/dto.ts`
- Modify: `backend/src/vendors/vendors.service.ts`
- Modify: `frontend/components/vendors/vendor-form.tsx`

- [ ] **Step 1: Allow `customerId` on `UpdateVendorDto`**

  Open `backend/src/vendors/dto.ts`. Add to `UpdateVendorDto`:

  ```ts
    @IsString()
    @IsOptional()
    // empty string clears the link; UUID sets it. The service translates "" → null.
    customerId?: string | null;
  ```

  Add the same field to `CreateVendorDto` (optional) so future creates can include it.

- [ ] **Step 2: Pass `customerId` through in `vendors.service.ts`**

  Open `backend/src/vendors/vendors.service.ts`. In the `update` method (or wherever the DTO is mapped to Prisma `data`), add:

  ```ts
  // Treat empty string as "clear the link". UUID sets it. Undefined leaves it untouched.
  if (dto.customerId !== undefined) {
    data.customerId = dto.customerId === '' ? null : dto.customerId;
  }
  ```

  Mirror the same logic in `create` if the DTO carries `customerId`.

- [ ] **Step 3: Verify backend still boots and the field round-trips**

  ```bash
  docker compose build backend && docker compose up -d backend
  ```

  Then exercise the API end-to-end:

  ```bash
  VID=$(curl -s http://localhost:4000/vendors | jq -r '.[0].id')
  CID=$(curl -s http://localhost:4000/customers | jq -r '.[0].id')
  curl -s -X PATCH http://localhost:4000/vendors/$VID \
    -H 'Content-Type: application/json' -d "{\"customerId\":\"$CID\"}" | jq .customerId
  ```
  Expected: prints the customer id. Now clear it:

  ```bash
  curl -s -X PATCH http://localhost:4000/vendors/$VID \
    -H 'Content-Type: application/json' -d '{"customerId":""}' | jq .customerId
  ```
  Expected: prints `null`.

- [ ] **Step 4: Update the vendor form UI**

  Open `frontend/components/vendors/vendor-form.tsx`. Add a Customer Select below the Kind field. It needs:

  - A new prop `customers: Customer[]` on the form component.
  - Local state `customerId` initialised from `vendor?.customerId ?? ''`.
  - A `<Select>` with `__none__` as the "— none —" item plus one item per active customer.
  - Helper text below: `Linking a vendor to a customer enables automatic candidate matching in the Payments queue.`
  - On submit, include `customerId: customerId === '__none__' ? '' : customerId` in the PATCH body.

  Concretely add this block beside the existing fields:

  ```tsx
  <Field label="Customer">
    <Select value={customerId || '__none__'} onValueChange={setCustomerId}>
      <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— none —</SelectItem>
        {customers.map((c) => (
          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <p className="mt-1 text-xs text-slate-500">
      Linking a vendor to a customer enables automatic candidate matching in the Payments queue.
    </p>
  </Field>
  ```

  Adjust the parent `app/vendors/[id]/page.tsx` (server component) to fetch customers and pass them down.

- [ ] **Step 5: Rebuild frontend, verify in browser**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  ```
  Then open `http://localhost:3000/vendors`, pick a vendor, set its customer, save. Refresh — the field persists.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/vendors/dto.ts backend/src/vendors/vendors.service.ts frontend/components/vendors/vendor-form.tsx frontend/app/vendors/
  git commit -m "feat(vendors): customer linkage field on vendor edit form"
  ```

---

## Task 15: Invoice list — `PARTIAL_PAID` badge + filter pill + gate manual status

Three small UI touches in two files. Per spec §10, the manual status control is gated to DRAFT/VOID only (SENT/VIEWED/PARTIAL_PAID/PAID are derived).

**Files:**
- Modify: `frontend/components/invoices/invoices-list.tsx`
- Modify: `frontend/components/invoices/invoice-form.tsx`

- [ ] **Step 1: Add the `PARTIAL_PAID` badge tone in the list**

  Open `frontend/components/invoices/invoices-list.tsx`. Locate the existing status → className map (or inline conditional) and add the `PARTIAL_PAID` branch with amber tones:

  ```ts
  // Wherever the status tone map is defined:
  const STATUS_TONE: Record<string, string> = {
    DRAFT:   'bg-slate-50 text-slate-700 border-slate-200',
    SENT:    'bg-blue-50 text-blue-900 border-blue-200',
    VIEWED:  'bg-violet-50 text-violet-900 border-violet-200',
    PARTIAL_PAID: 'bg-amber-50 text-amber-900 border-amber-200',
    PAID:    'bg-emerald-50 text-emerald-900 border-emerald-200',
    VOID:    'bg-rose-50 text-rose-900 border-rose-200',
  };
  ```

  (If the existing file uses a different shape — inline class names per status — extend it in place. Don't introduce a new pattern.)

- [ ] **Step 2: Add `PARTIAL_PAID` to the status filter pill row**

  In the same file, locate the array of filter-pill values (typically `['DRAFT', 'SENT', 'VIEWED', 'PAID', 'VOID']` or similar) and insert `'PARTIAL_PAID'` between `VIEWED` and `PAID`. The display order across the app is hard-coded `DRAFT → SENT → VIEWED → PARTIAL_PAID → PAID → VOID`.

- [ ] **Step 3: Gate the manual status control on the edit form**

  Open `frontend/components/invoices/invoice-form.tsx`. Find the Status `<Select>` (or radio group). Wrap it so only `DRAFT` and `VOID` are editable; if the current status is `SENT`, `VIEWED`, `PARTIAL_PAID`, or `PAID`, render a read-only badge with helper text:

  ```tsx
  const DERIVED_STATUSES = new Set(['SENT', 'VIEWED', 'PARTIAL_PAID', 'PAID']);
  const isDerived = DERIVED_STATUSES.has(currentStatus);

  return isDerived ? (
    <div>
      <span className={`inline-flex rounded border px-2 py-1 text-xs ${STATUS_TONE[currentStatus]}`}>
        {currentStatus}
      </span>
      <p className="mt-1 text-xs text-slate-500">
        Status is derived from payment allocations. Apply or un-apply payments to change it.
      </p>
    </div>
  ) : (
    <Select value={status} onValueChange={setStatus}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="DRAFT">DRAFT</SelectItem>
        <SelectItem value="VOID">VOID</SelectItem>
      </SelectContent>
    </Select>
  );
  ```

  (If the file currently emits SENT/VIEWED/PARTIAL_PAID/PAID/FAILED_TO_SEND in the select, drop them.)

- [ ] **Step 4: Rebuild frontend, verify in the browser**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  ```

  - Navigate to `/invoices`. Confirm the filter pill row shows `DRAFT | SENT | VIEWED | PARTIAL_PAID | PAID | VOID`.
  - Open a SENT invoice. Confirm the Status field is read-only with the helper text.
  - Open a DRAFT invoice. Confirm the Select still shows DRAFT + VOID only.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/components/invoices/invoices-list.tsx frontend/components/invoices/invoice-form.tsx
  git commit -m "feat(invoices): PARTIAL_PAID badge + filter pill + gate manual status control"
  ```

  Commit message must include the trade-off note: derived statuses are no longer manually editable.

---

## Task 16: `/banking/payments` queue page

Server-rendered page + client list component. Mirrors the `/transactions/ai-review` layout.

**Files:**
- Create: `frontend/app/banking/payments/page.tsx`
- Create: `frontend/components/payments/payments-queue.tsx`

- [ ] **Step 1: Create the server page**

  ```bash
  mkdir -p /home/reallybasic/Projects/Accounting/frontend/app/banking/payments /home/reallybasic/Projects/Accounting/frontend/components/payments
  ```

  Create `frontend/app/banking/payments/page.tsx`:

  ```tsx
  import { listPaymentsQueue } from "@/lib/payments";
  import { PaymentsQueue } from "@/components/payments/payments-queue";

  export const dynamic = "force-dynamic";

  export default async function PaymentsQueuePage({
    searchParams,
  }: {
    searchParams: Promise<{ showAll?: string }>;
  }) {
    const sp = await searchParams;
    const showAll = sp.showAll === "true";
    const items = await listPaymentsQueue(showAll);
    return <PaymentsQueue initialItems={items} initialShowAll={showAll} />;
  }
  ```

- [ ] **Step 2: Create the client list**

  Create `frontend/components/payments/payments-queue.tsx`:

  ```tsx
  "use client";

  import { useState } from "react";
  import Link from "next/link";
  import { useRouter, useSearchParams } from "next/navigation";
  import { ArrowLeft } from "lucide-react";
  import { Button } from "@/components/ui/button";
  import { dismissPayment, listPaymentsQueue } from "@/lib/payments";
  import type { PaymentQueueItem } from "@/lib/types";
  import { ApplyPaymentModal } from "./apply-payment-modal";

  function fmtAmount(n: string) {
    return `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  export function PaymentsQueue({
    initialItems,
    initialShowAll,
  }: {
    initialItems: PaymentQueueItem[];
    initialShowAll: boolean;
  }) {
    const router = useRouter();
    const sp = useSearchParams();
    const [items, setItems] = useState<PaymentQueueItem[]>(initialItems);
    const [showAll, setShowAll] = useState(initialShowAll);
    const [openTx, setOpenTx] = useState<PaymentQueueItem | null>(null);

    function toggleShowAll(next: boolean) {
      const params = new URLSearchParams(sp);
      if (next) params.set("showAll", "true"); else params.delete("showAll");
      router.replace(`/banking/payments?${params.toString()}`);
      setShowAll(next);
      void listPaymentsQueue(next).then(setItems);
    }

    async function onDismiss(t: PaymentQueueItem) {
      await dismissPayment(t.id);
      setItems((arr) => arr.filter((x) => x.id !== t.id));
    }

    function onApplied(_txId: string) {
      // After a successful apply the row should drop from the queue.
      setItems((arr) => arr.filter((x) => x.id !== _txId));
      setOpenTx(null);
    }

    return (
      <div className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <Link href="/transactions" className="text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-lg font-semibold">Payments to review ({items.length} pending)</h1>
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showAll} onChange={(e) => toggleShowAll(e.target.checked)} />
            Show all positive
          </label>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            Nothing to review. Bank transactions categorised as Income — Customer payments will appear here.
            {!showAll && (
              <div className="mt-2">
                <Button size="sm" variant="ghost" onClick={() => toggleShowAll(true)}>Show all positive instead</Button>
              </div>
            )}
          </div>
        ) : (
          items.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <span className="font-mono">{t.date}</span>
              <span className="font-mono font-semibold">{fmtAmount(t.amount)}</span>
              <span className="flex-1 truncate">{t.description}</span>
              <span className="text-xs text-slate-500">{t.accountName}</span>
              <span className="text-xs text-slate-700">
                {t.vendorName ?? "—"}{t.vendorCustomerName ? ` (→ ${t.vendorCustomerName})` : ""}
              </span>
              <Button size="sm" onClick={() => setOpenTx(t)}>Apply</Button>
              <Button size="sm" variant="ghost" onClick={() => onDismiss(t)}>Not a customer payment</Button>
            </div>
          ))
        )}

        {openTx && (
          <ApplyPaymentModal
            context="queue"
            transaction={openTx}
            onClose={() => setOpenTx(null)}
            onApplied={() => onApplied(openTx.id)}
          />
        )}
      </div>
    );
  }
  ```

  (The `ApplyPaymentModal` component is created in Task 18; for now its import will fail TypeScript but be temporarily satisfied by a stub.)

- [ ] **Step 3: Stub the modal so this page compiles**

  Create `frontend/components/payments/apply-payment-modal.tsx` as a minimal stub:

  ```tsx
  "use client";
  import type { PaymentQueueItem } from "@/lib/types";

  export function ApplyPaymentModal(props: {
    context: "queue" | "invoice" | "transaction";
    transaction?: PaymentQueueItem | null;
    transactionId?: string;
    invoiceId?: string;
    onClose: () => void;
    onApplied: () => void;
  }) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="rounded-lg bg-white p-4 text-sm">
          <div>Apply payment — stub (Task 18 implements the real modal)</div>
          <button className="mt-3 rounded border px-2 py-1" onClick={props.onClose}>Close</button>
        </div>
      </div>
    );
  }
  ```

  This will be replaced in Task 18.

- [ ] **Step 4: Rebuild frontend, verify the route**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  ```

  Open `http://localhost:3000/banking/payments`. Expected: header, empty state (until tasks below add demo data). No console errors. Toggle "Show all positive" — URL gains `?showAll=true` and the list reloads.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/app/banking/payments/page.tsx frontend/components/payments/payments-queue.tsx frontend/components/payments/apply-payment-modal.tsx
  git commit -m "feat(payments): /banking/payments queue page + apply-modal stub"
  ```

---

## Task 17: Sidebar — Payments entry + badge polling

Adds a Payments nav item under the existing Banking group with a count badge polled every 30s.

**Files:**
- Modify: `frontend/components/layout/sidebar.tsx`

- [ ] **Step 1: Extend nav and badge state**

  Open `frontend/components/layout/sidebar.tsx`. Locate the existing `nav` array, the Banking group. Insert the Payments entry **above** AI Review:

  ```ts
  // Inside the Banking group's items array, before the AI Review entry:
  { label: "Payments", href: "/banking/payments", badgeKey: "paymentsCount" },
  ```

  At the top, alongside the existing `reviewQueueCount` import:

  ```ts
  import { paymentsQueueCount } from "@/lib/payments";
  ```

  In the `SidebarBody` function, alongside `useState<number>(0)` for `aiReviewCount`, add:

  ```ts
  const [paymentsCount, setPaymentsCount] = useState<number>(0);
  ```

  And in the existing polling `useEffect`, add a second tick branch:

  ```ts
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void reviewQueueCount().then((r) => { if (!cancelled) setAiReviewCount(r.count); }).catch(() => {});
      void paymentsQueueCount().then((r) => { if (!cancelled) setPaymentsCount(r.count); }).catch(() => {});
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  ```

  Pass `paymentsCount` down through `NavGroup`'s prop and switch the badge resolution to a map:

  ```tsx
  // Update NavGroup signature and props passthrough:
  function NavGroup({ group, pathname, onNavigate, badgeCounts }: {
    group: Extract<Group, { kind: "group" }>;
    pathname: string;
    onNavigate?: () => void;
    badgeCounts: Record<string, number>;
  }) {
  // ...inside the inner map:
  const badgeCount = item.badgeKey ? (badgeCounts[item.badgeKey] ?? 0) : 0;
  ```

  And in the caller:

  ```tsx
  <NavGroup
    key={i}
    group={entry}
    pathname={pathname}
    onNavigate={onNavigate}
    badgeCounts={{ aiReviewCount, paymentsCount }}
  />
  ```

- [ ] **Step 2: Add a sub-icon for the new entry**

  In the `subIcons` map, import `Wallet` (already imported) or `Coins`. Use the `Wallet` icon or add a new Phosphor icon if you'd like a distinct visual. Map `/banking/payments` → `Wallet` (or pick `Receipt` / `Coins` if `Wallet` is already taken; verify against the imports at the top of the file).

  ```ts
  "/banking/payments": Wallet,
  ```

- [ ] **Step 3: Rebuild frontend, verify the sidebar**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  ```

  Open `http://localhost:3000`. The Banking group now lists Payments below AI Review (or above — match the spec). Hover for 30s, the badge should remain 0 until a positive-income transaction without allocations exists.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/components/layout/sidebar.tsx
  git commit -m "feat(frontend): sidebar Payments entry with badge polling"
  ```

---

## Task 18: `ApplyPaymentModal` — shell + Context A from queue

Replaces the stub from Task 16. Loads candidates if `vendor.customerId` is set; renders scored list with checkboxes, auto-fill amounts, score-breakdown tooltip, footer running totals, bundle chip. Submit calls `/payments/apply`.

**Files:**
- Modify: `frontend/components/payments/apply-payment-modal.tsx`

- [ ] **Step 1: Replace the stub with the Context A modal**

  Overwrite `frontend/components/payments/apply-payment-modal.tsx`:

  ```tsx
  "use client";

  import { useEffect, useMemo, useState } from "react";
  import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import { Button } from "@/components/ui/button";
  import { applyPayment, getCandidates } from "@/lib/payments";
  import type { CandidatesResponse, PaymentQueueItem, ScoredInvoice } from "@/lib/types";

  function fmt(n: string | number) {
    return `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  type LineState = { checked: boolean; amount: string };

  export function ApplyPaymentModal({
    context,
    transaction,
    onClose,
    onApplied,
  }: {
    context: "queue" | "invoice" | "transaction";
    transaction: PaymentQueueItem;
    onClose: () => void;
    onApplied: () => void;
  }) {
    const [candidates, setCandidates] = useState<CandidatesResponse | null>(null);
    const [lines, setLines] = useState<Record<string, LineState>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (!transaction.vendorCustomerId) {
        // Context A but vendor unlinked — Task 19 covers the picker flow.
        setCandidates({ candidates: [], bundleSuggestion: null });
        return;
      }
      void getCandidates(transaction.id).then((r) => {
        setCandidates(r);
        // Pre-check bundle if present.
        if (r.bundleSuggestion) {
          const seed: Record<string, LineState> = {};
          for (const b of r.bundleSuggestion.invoices) {
            seed[b.id] = { checked: true, amount: b.amountOutstanding };
          }
          setLines(seed);
        }
      }).catch((e: any) => setError(e?.message ?? "Failed to load candidates"));
    }, [transaction.id, transaction.vendorCustomerId]);

    function toggle(c: ScoredInvoice, checked: boolean) {
      setLines((prev) => {
        const next = { ...prev };
        if (checked) {
          const auto = Number(transaction.unallocated) < Number(c.amountOutstanding)
            ? transaction.unallocated
            : c.amountOutstanding;
          next[c.id] = { checked: true, amount: auto };
        } else {
          delete next[c.id];
        }
        return next;
      });
    }

    function setAmount(id: string, amount: string) {
      setLines((prev) => ({ ...prev, [id]: { ...prev[id], amount } }));
    }

    const totals = useMemo(() => {
      let applied = 0;
      for (const v of Object.values(lines)) if (v.checked) applied += Number(v.amount || 0);
      const remaining = Math.max(Number(transaction.unallocated) - applied, 0);
      const credit = remaining;
      return { applied, remaining, credit };
    }, [lines, transaction.unallocated]);

    async function onSubmit() {
      setSubmitting(true);
      setError(null);
      try {
        const allocations = Object.entries(lines)
          .filter(([, v]) => v.checked && Number(v.amount) > 0)
          .map(([invoiceId, v]) => ({ invoiceId, amount: v.amount }));
        if (allocations.length === 0) {
          setError("Pick at least one invoice and set an amount > 0.");
          return;
        }
        await applyPayment({ transactionId: transaction.id, allocations });
        onApplied();
      } catch (e: any) {
        setError(e?.message ?? "Apply failed");
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
              <span className="font-mono">{transaction.date}</span>
              <span className="font-mono font-semibold">{fmt(transaction.amount)}</span>
              <span className="flex-1 truncate">{transaction.description}</span>
              <span>{transaction.accountName}</span>
            </div>

            {candidates?.bundleSuggestion && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2">
                Looks like this pays {candidates.bundleSuggestion.invoices.length} invoices:{" "}
                {candidates.bundleSuggestion.invoices.map((i) => `INV-${i.invoiceNumber} ${fmt(i.amountOutstanding)}`).join(" + ")}
                {" = "}{fmt(candidates.bundleSuggestion.total)}
              </div>
            )}

            {!candidates ? (
              <div className="text-slate-500">Loading…</div>
            ) : candidates.candidates.length === 0 ? (
              <div className="text-slate-500">No open invoices for this customer.</div>
            ) : (
              <ul className="divide-y divide-slate-200 rounded border border-slate-200">
                {candidates.candidates.map((c) => {
                  const line = lines[c.id];
                  return (
                    <li key={c.id} className="flex items-center gap-2 p-2">
                      <input
                        type="checkbox"
                        checked={!!line?.checked}
                        onChange={(e) => toggle(c, e.target.checked)}
                      />
                      <span className="font-mono w-20">INV-{c.invoiceNumber}</span>
                      <span className="font-mono w-24 text-xs text-slate-500">{c.invoiceDate}</span>
                      <span className="font-mono w-24 text-right">{fmt(c.amountOutstanding)}</span>
                      <input
                        className="ml-auto w-24 rounded border border-slate-300 px-2 py-1 font-mono text-right"
                        value={line?.amount ?? ""}
                        disabled={!line?.checked}
                        onChange={(e) => setAmount(c.id, e.target.value)}
                      />
                      <span
                        className="text-xs text-slate-500"
                        title={`+${c.signals.invoiceNumber ? 60 : 0} invoice# · +${c.signals.exactAmount ? 40 : 0} exact · +${c.signals.customerToken ? 15 : 0} customer · +${c.signals.datePlausible ? 10 : 0} date · +${c.signals.partialBonus ? 5 : 0} partial`}
                      >
                        {c.score}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex justify-between rounded bg-slate-50 p-2 text-xs">
              <span>Applied: {fmt(totals.applied)}</span>
              <span>Remaining: {fmt(totals.remaining)}</span>
              <span>Credit to customer: {fmt(totals.credit)}</span>
            </div>
            {error && <div className="text-rose-700">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={onSubmit} disabled={submitting || totals.applied === 0}>
              {submitting ? "Applying…" : `Apply ${fmt(totals.applied)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  ```

- [ ] **Step 2: Rebuild frontend, verify the modal opens**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  ```

  Set up a seed scenario manually: create a customer, link a vendor to that customer, import or hand-create a positive INCOME-categorised transaction, and create 2-3 SENT invoices for that customer. Open `/banking/payments`, click Apply on the row, and confirm:
  - candidate list renders with scores
  - checkbox auto-fills the amount
  - footer totals update live
  - clicking Apply with no selection shows the validation message

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/components/payments/apply-payment-modal.tsx
  git commit -m "feat(payments): ApplyPaymentModal Context A — scored candidates + bundle chip"
  ```

---

## Task 19: `ApplyPaymentModal` — customer picker + bind checkbox + escape hatch

Extends the modal with: customer Select when vendor unlinked; bind-vendor checkbox; collapsible "Apply to any invoice" cross-customer search.

**Files:**
- Modify: `frontend/components/payments/apply-payment-modal.tsx`
- Modify: `frontend/lib/payments.ts` (new helper to list all open invoices)

- [ ] **Step 1: Add a backend-side helper for cross-customer search**

  The escape hatch needs an "open invoices across all customers" endpoint. The existing `/invoices` controller likely already lists invoices with a `status` filter — verify by reading `backend/src/invoices/invoices.controller.ts`. If it supports `?status=SENT&status=VIEWED&status=PARTIAL_PAID&search=...`, use it directly. If not, add a `?openOnly=true&search=` query branch to the existing list endpoint (minimal additive change).

  Add to `frontend/lib/payments.ts`:

  ```ts
  import type { Invoice } from "./types";

  export function listOpenInvoices(search = ""): Promise<Invoice[]> {
    const qs = new URLSearchParams({ openOnly: "true" });
    if (search) qs.set("search", search);
    return api<Invoice[]>(`/invoices?${qs.toString()}`);
  }
  ```

- [ ] **Step 2: Add customer picker + bind checkbox to the modal**

  In `frontend/components/payments/apply-payment-modal.tsx`, accept a new `customers` prop (loaded by the caller — `PaymentsQueue` server fetch). Add state for `pickedCustomerId` and `bindVendor`. When `transaction.vendorCustomerId` is null and `pickedCustomerId` is empty, render only the picker. When `pickedCustomerId` is set, call `getCandidates` — but the backend keys off `vendor.customerId`, so add a second client call: refetch candidates against a synthesised query.

  Cleaner alternative: pass `pickedCustomerId` to a new backend endpoint variant or, for v1, just submit `bindVendorToCustomerId` and re-render with the customer's open invoices fetched via `listOpenInvoices`-with-customer-filter. For minimal surface, pre-filter the cross-customer search by `pickedCustomerId`:

  Add to the modal's render, between the header strip and the candidate list:

  ```tsx
  {!transaction.vendorCustomerId && !pickedCustomerId && (
    <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-2">
      <div className="text-xs">This vendor isn't linked to a customer. Pick one to see candidate invoices:</div>
      <Select value={pickedCustomerId} onValueChange={setPickedCustomerId}>
        <SelectTrigger><SelectValue placeholder="Select customer…" /></SelectTrigger>
        <SelectContent>
          {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )}
  {pickedCustomerId && (
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={bindVendor} onChange={(e) => setBindVendor(e.target.checked)} />
      Bind this vendor to {customers.find((c) => c.id === pickedCustomerId)?.name} for next time
    </label>
  )}
  ```

  When `pickedCustomerId` is set, fetch open invoices for that customer:

  ```ts
  useEffect(() => {
    if (!pickedCustomerId) return;
    void listOpenInvoices(/* search */ "")
      .then((all) => all.filter((i) => i.customerId === pickedCustomerId))
      .then((open) => {
        const c: CandidatesResponse = {
          candidates: open.map((i) => ({
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            invoiceDate: i.invoiceDate.slice(0, 10),
            totalAmount: String(i.totalAmount),
            amountOutstanding: String(i.amountOutstanding),
            status: i.status,
            customerId: i.customerId ?? null,
            customerName: null,
            score: 0,
            signals: { invoiceNumber: false, exactAmount: false, customerToken: false, datePlausible: false, partialBonus: false },
          })),
          bundleSuggestion: null,
        };
        setCandidates(c);
      });
  }, [pickedCustomerId]);
  ```

  In `onSubmit`, include `bindVendorToCustomerId` when `bindVendor === true && pickedCustomerId`:

  ```ts
  await applyPayment({
    transactionId: transaction.id,
    allocations,
    bindVendorToCustomerId: bindVendor && pickedCustomerId ? pickedCustomerId : undefined,
  });
  ```

- [ ] **Step 3: Add the collapsible "Apply to any invoice" escape hatch**

  Below the candidate list, add:

  ```tsx
  <details className="rounded border border-slate-200 p-2">
    <summary className="cursor-pointer text-xs text-slate-700">▸ Apply to any invoice</summary>
    <div className="mt-2 space-y-2">
      <input
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        placeholder="Search by invoice number, customer, amount…"
        value={crossSearch}
        onChange={(e) => setCrossSearch(e.target.value)}
      />
      <ul className="max-h-48 overflow-auto divide-y divide-slate-100">
        {crossResults.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-1 text-xs">
            <input type="checkbox" checked={!!lines[c.id]?.checked} onChange={(e) => toggle(c, e.target.checked)} />
            <span className="font-mono w-20">INV-{c.invoiceNumber}</span>
            <span className="flex-1 truncate text-slate-500">{c.customerName ?? '—'}</span>
            <span className="font-mono w-24 text-right">{fmt(c.amountOutstanding)}</span>
          </li>
        ))}
      </ul>
    </div>
  </details>
  ```

  Debounce the search:

  ```ts
  useEffect(() => {
    if (!crossSearch) { setCrossResults([]); return; }
    const t = setTimeout(() => {
      void listOpenInvoices(crossSearch).then((all) => {
        setCrossResults(all.map((i) => /* map to ScoredInvoice shape */ ({ ...stubbed scoring ... })));
      });
    }, 250);
    return () => clearTimeout(t);
  }, [crossSearch]);
  ```

- [ ] **Step 4: Pass `customers` from `PaymentsQueue` to the modal**

  In `frontend/components/payments/payments-queue.tsx`, accept `customers: Customer[]` as a prop, and forward it. In `frontend/app/banking/payments/page.tsx`, fetch customers via `listCustomers()` and pass them through:

  ```tsx
  import { listCustomers } from "@/lib/customers"; // existing helper
  const [items, customers] = await Promise.all([listPaymentsQueue(showAll), listCustomers()]);
  return <PaymentsQueue initialItems={items} initialShowAll={showAll} customers={customers} />;
  ```

- [ ] **Step 5: Rebuild frontend, verify the picker + bind flow**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  ```

  - Create a transaction whose vendor is **not** linked to any customer.
  - Open the apply modal — Customer picker appears.
  - Pick a customer, candidates re-load (open invoices for that customer).
  - Tick "Bind this vendor…", apply. Then verify on `/vendors/[id]` that the vendor now has the customer linked.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/components/payments/apply-payment-modal.tsx frontend/components/payments/payments-queue.tsx frontend/app/banking/payments/page.tsx frontend/lib/payments.ts
  git commit -m "feat(payments): customer picker + bind-vendor checkbox + cross-customer escape hatch"
  ```

---

## Task 20: `ApplyPaymentModal` — customer credit strip

Surfaces the `/customers/:id/credit` data when the modal opens against a customer with prior unallocated transactions.

**Files:**
- Modify: `frontend/components/payments/apply-payment-modal.tsx`

- [ ] **Step 1: Fetch credit when a customer is known**

  Add state and effect in the modal:

  ```ts
  const [credit, setCredit] = useState<CustomerCredit | null>(null);
  useEffect(() => {
    const customerId = transaction.vendorCustomerId ?? pickedCustomerId;
    if (!customerId) { setCredit(null); return; }
    void getCustomerCredit(customerId)
      .then(setCredit)
      .catch(() => setCredit(null));
  }, [transaction.vendorCustomerId, pickedCustomerId]);
  ```

- [ ] **Step 2: Render the strip when `credit > 0`**

  Below the bundle chip, render:

  ```tsx
  {credit && Number(credit.credit) > 0 && (
    <div className="flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 p-2 text-xs">
      <span>
        Customer credit available: {fmt(credit.credit)} from {credit.transactions.length} earlier transaction{credit.transactions.length === 1 ? "" : "s"}.
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          // Close this modal and reopen it against the oldest credit-bearing transaction.
          const oldest = credit.transactions[credit.transactions.length - 1];
          onClose();
          // Use a custom event to ask the parent to re-open against the older transaction.
          window.dispatchEvent(new CustomEvent("apply-payment-modal:reopen", { detail: { transactionId: oldest.id } }));
        }}
      >
        Use existing credit instead →
      </Button>
    </div>
  )}
  ```

- [ ] **Step 3: Handle the reopen event in `PaymentsQueue`**

  In `frontend/components/payments/payments-queue.tsx`, attach a listener that fetches the older transaction (it may or may not be in the current `items` array) and opens the modal against it. The simplest approach: load the queue with `showAll=true`, find the matching row, set `openTx` to it. Add:

  ```ts
  useEffect(() => {
    const handler = (e: any) => {
      void listPaymentsQueue(true).then((all) => {
        const found = all.find((x) => x.id === e.detail.transactionId);
        if (found) setOpenTx(found);
      });
    };
    window.addEventListener("apply-payment-modal:reopen", handler as any);
    return () => window.removeEventListener("apply-payment-modal:reopen", handler as any);
  }, []);
  ```

- [ ] **Step 4: Rebuild and verify**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  ```

  - Create two transactions for the same customer; allocate part of the older one to one invoice; leave a remainder.
  - Open the apply modal against the **newer** transaction.
  - Expect the green credit strip with "Use existing credit instead →".
  - Click the link — the modal closes and reopens against the older transaction (whose `remaining > 0`).

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/components/payments/apply-payment-modal.tsx frontend/components/payments/payments-queue.tsx
  git commit -m "feat(payments): customer-credit strip + redirect to older transaction"
  ```

---

## Task 21: Invoice view — Allocations panel + un-apply confirm

Renders allocations below line items, with trash icon + confirm modal that previews the resulting status using `recomputeInvoicePayment`'s output (computed client-side).

**Files:**
- Create: `frontend/components/payments/allocations-panel.tsx`
- Create: `frontend/components/payments/unapply-confirm-dialog.tsx`
- Modify: the invoice view file (locate via grep — likely `frontend/app/invoices/[id]/page.tsx` or `frontend/components/invoices/invoice-form.tsx`)

- [ ] **Step 1: Locate the invoice view file**

  Run:

  ```bash
  grep -rn "lineItems" /home/reallybasic/Projects/Accounting/frontend/components/invoices/ /home/reallybasic/Projects/Accounting/frontend/app/invoices/
  ```

  Identify the component that renders the invoice line items table on the view/edit page. That's where the panel inserts.

- [ ] **Step 2: Create the un-apply confirm dialog**

  Create `frontend/components/payments/unapply-confirm-dialog.tsx`:

  ```tsx
  "use client";

  import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import { Button } from "@/components/ui/button";

  export function UnapplyConfirmDialog({
    amount,
    resultingStatus,
    onCancel,
    onConfirm,
  }: {
    amount: string;
    resultingStatus: "DRAFT" | "SENT" | "VIEWED" | "PARTIAL_PAID";
    onCancel: () => void;
    onConfirm: () => void;
  }) {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Un-apply payment</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Un-apply ${Number(amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })} from this invoice?
            The invoice will revert to <strong>{resultingStatus}</strong>.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button onClick={onConfirm}>Un-apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  ```

- [ ] **Step 3: Create the panel**

  Create `frontend/components/payments/allocations-panel.tsx`:

  ```tsx
  "use client";

  import { useState } from "react";
  import { Trash2 } from "lucide-react";
  import Link from "next/link";
  import { Button } from "@/components/ui/button";
  import { deleteAllocation } from "@/lib/payments";
  import type { Allocation, Invoice } from "@/lib/types";
  import { UnapplyConfirmDialog } from "./unapply-confirm-dialog";

  function previewStatus(
    invoice: Pick<Invoice, "status" | "amountOutstanding" | "totalAmount">,
    removeAmount: string,
  ): "DRAFT" | "SENT" | "VIEWED" | "PARTIAL_PAID" {
    const newPaid = Number(invoice.totalAmount) - Number(invoice.amountOutstanding) - Number(removeAmount);
    if (newPaid <= 0) {
      // viewedAt info isn't shipped to the client here — assume SENT for the preview text.
      // The server-side recompute is the source of truth and may go VIEWED. UX: text reads
      // "SENT/VIEWED" if we don't know; for v1 the simpler "SENT" message is acceptable.
      return "SENT";
    }
    return "PARTIAL_PAID";
  }

  export function AllocationsPanel({
    invoice,
    allocations,
    onChanged,
    onReceivePayment,
  }: {
    invoice: Invoice & { lineItems?: unknown[] };
    allocations: Array<Allocation & { transactionDescription?: string; transactionDate?: string }>;
    onChanged: () => void;
    onReceivePayment: () => void;
  }) {
    const [pending, setPending] = useState<{ id: string; amount: string } | null>(null);

    if (allocations.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          No payments allocated yet.
          <Button size="sm" className="ml-2" onClick={onReceivePayment}>Receive payment</Button>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2 text-sm font-medium">Allocations</div>
        <ul className="divide-y divide-slate-100">
          {allocations.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="font-mono text-xs">{a.transactionDate?.slice(0, 10) ?? a.createdAt.slice(0, 10)}</span>
              <Link
                href={`/transactions?txId=${a.transactionId}`}
                className="flex-1 truncate text-slate-700 hover:underline"
              >
                {a.transactionDescription ?? a.transactionId}
              </Link>
              <span className="font-mono">${Number(a.amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
              <button
                className="text-slate-400 hover:text-rose-700"
                onClick={() => setPending({ id: a.id, amount: a.amount })}
                aria-label="Un-apply"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        {pending && (
          <UnapplyConfirmDialog
            amount={pending.amount}
            resultingStatus={previewStatus(invoice, pending.amount)}
            onCancel={() => setPending(null)}
            onConfirm={async () => {
              await deleteAllocation(pending.id);
              setPending(null);
              onChanged();
            }}
          />
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Wire the panel into the invoice view**

  In the invoice view component identified in Step 1, fetch `allocations` (extend the `GET /invoices/:id` controller in `backend/src/invoices/invoices.controller.ts` to include `allocations: { include: { transaction: { select: { date: true, description: true }}}}` — additive, no DTO change needed). Render the panel between line items and totals:

  ```tsx
  <AllocationsPanel
    invoice={invoice}
    allocations={(invoice as any).allocations?.map((a: any) => ({
      ...a,
      transactionDate: a.transaction?.date,
      transactionDescription: a.transaction?.description,
    })) ?? []}
    onChanged={() => router.refresh()}
    onReceivePayment={() => setReceivePaymentOpen(true)}  // wired in Task 22
  />
  ```

- [ ] **Step 5: Rebuild + verify in browser**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  docker compose build backend && docker compose up -d backend  # for the controller include
  ```

  Open an invoice that has at least one allocation (created via the Payments queue in Task 18). The panel renders. Click the trash icon → confirm dialog appears with "revert to SENT" or "revert to PARTIAL_PAID" depending on remaining allocations. Confirm → allocation removed, panel updates, invoice status reflects the recompute.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/components/payments/allocations-panel.tsx frontend/components/payments/unapply-confirm-dialog.tsx backend/src/invoices/invoices.controller.ts frontend/components/invoices/ frontend/app/invoices/
  git commit -m "feat(invoices): Allocations panel + un-apply confirm on invoice view"
  ```

---

## Task 22: Invoice "Receive payment" button + Context B modal

A header button on the invoice view opens `ApplyPaymentModal` in Context B — pointed at the invoice, listing customer's transactions with `remaining > 0`.

**Files:**
- Modify: `frontend/components/payments/apply-payment-modal.tsx` (Context B branch)
- Modify: the invoice view file from Task 21

- [ ] **Step 1: Add Context B support to the modal**

  The modal currently expects `transaction: PaymentQueueItem`. For Context B it needs `invoice: Invoice` and lists transactions. Refactor the prop signature:

  ```ts
  type Props =
    | { context: "queue" | "transaction"; transaction: PaymentQueueItem; customers: Customer[]; onClose: () => void; onApplied: () => void }
    | { context: "invoice"; invoice: Invoice; onClose: () => void; onApplied: () => void };
  ```

  In Context B, fetch credit for the invoice's customer to get the candidate transactions list (each has `remaining`). For each row, default the amount to `min(invoice.amountOutstanding, tx.remaining)`. Submit via the **older** transaction(s) using the same `applyPayment` endpoint — one POST per selected transaction:

  ```tsx
  // Context B render branch
  if (props.context === "invoice") {
    const { invoice } = props;
    const [credit, setCredit] = useState<CustomerCredit | null>(null);
    useEffect(() => {
      if (!invoice.customerId) return;
      void getCustomerCredit(invoice.customerId).then(setCredit);
    }, [invoice.customerId]);

    // ...render a row per credit.transactions with checkbox + auto-filled amount field...

    async function submit() {
      for (const txId of selectedTxIds) {
        await applyPayment({
          transactionId: txId,
          allocations: [{ invoiceId: invoice.id, amount: amountByTx[txId] }],
        });
      }
      onApplied();
    }
  }
  ```

  Footer: `Applied: ${X} of ${invoice.amountOutstanding} outstanding`.

- [ ] **Step 2: Add the "Receive payment" button to the invoice view**

  In the invoice view header (next to existing actions), add:

  ```tsx
  <Button onClick={() => setReceivePaymentOpen(true)}>Receive payment</Button>
  {receivePaymentOpen && (
    <ApplyPaymentModal
      context="invoice"
      invoice={invoice}
      onClose={() => setReceivePaymentOpen(false)}
      onApplied={() => { setReceivePaymentOpen(false); router.refresh(); }}
    />
  )}
  ```

  Hide the button when `invoice.status === "PAID"` or `"VOID"`.

- [ ] **Step 3: Rebuild and verify**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  ```

  - Open a SENT invoice. Click "Receive payment".
  - The modal lists customer's transactions with `remaining > 0`, newest first.
  - Select one, confirm — invoice flips to PAID/PARTIAL_PAID and the Allocations panel updates.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/components/payments/apply-payment-modal.tsx frontend/components/invoices/ frontend/app/invoices/
  git commit -m "feat(invoices): Receive payment button + ApplyPaymentModal Context B"
  ```

---

## Task 23: Transaction row menu — "Apply to invoices" → Context C

Adds a menu item above Edit in the existing `transaction-row-menu.tsx`. Opens `ApplyPaymentModal` Context A from any transaction (even dismissed or non-INCOME).

**Files:**
- Modify: `frontend/components/transactions/transaction-row-menu.tsx`
- Modify: `frontend/components/transactions/transactions-table.tsx` (host the modal)

- [ ] **Step 1: Add the menu item**

  Open `frontend/components/transactions/transaction-row-menu.tsx`. Add a new menu entry **above** Edit:

  ```tsx
  <DropdownMenuItem onSelect={() => onApplyToInvoices?.(transaction)}>
    <Coins className="h-3.5 w-3.5" /> Apply to invoices
  </DropdownMenuItem>
  <DropdownMenuSeparator />
  ```

  Add `onApplyToInvoices?: (t: Transaction) => void` to the props.

- [ ] **Step 2: Host the modal in the transactions table**

  In `frontend/components/transactions/transactions-table.tsx`, add modal state:

  ```ts
  const [applyTx, setApplyTx] = useState<PaymentQueueItem | null>(null);
  ```

  Wire the prop:

  ```tsx
  <TransactionRowMenu
    transaction={t}
    onApplyToInvoices={(t) => setApplyTx(toQueueItem(t))}
    // ...existing props
  />
  ```

  Where `toQueueItem` is a local helper that adapts a `Transaction` to the `PaymentQueueItem` shape the modal expects (fill in `unallocated`, `vendorCustomerId`, etc., by reading the loaded transaction).

  Render the modal at the bottom:

  ```tsx
  {applyTx && (
    <ApplyPaymentModal
      context="transaction"
      transaction={applyTx}
      customers={customers}
      onClose={() => setApplyTx(null)}
      onApplied={() => { setApplyTx(null); router.refresh(); }}
    />
  )}
  ```

  Pass `customers` down from the parent server component (it already loads other lookup tables).

- [ ] **Step 3: Rebuild and verify**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  ```

  Open `/transactions`, hover any row, click the row menu — "Apply to invoices" appears at the top. Pick it, the modal opens, candidates load if the vendor is linked. Submitting applies the allocation and the row's `categoryId` / unallocated state updates after `router.refresh()`.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/components/transactions/transaction-row-menu.tsx frontend/components/transactions/transactions-table.tsx
  git commit -m "feat(transactions): Apply to invoices row-menu item — Context C"
  ```

---

## Task 24: Docs update

Last step. Update the four living-docs files + add a gotcha to `CLAUDE.md`.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `Architecture.md`
- Modify: `DatabaseSchema.md`
- Modify: `modules_and_logic.md`
- Modify: `DesignSystem.md`

- [ ] **Step 1: Update `Architecture.md`**

  Add a new subsection under the backend module list:

  > **`payments` module** — (Phase D) Invoice payment matching. Route prefix `/payments`. Houses `PaymentsService` (`getCandidates`, `applyAllocations`, `deleteAllocation`, `getQueue` / `getQueueCount`, `dismiss` / `undismiss`, `getCustomerCredit`) and three pure helpers (`recomputeInvoicePayment`, `scoreInvoice`, `findBundleSuggestion`). One-shot idempotent backfill runs from `onModuleInit`. Audit log lives in `AllocationEvent`. `/customers/:id/credit` is wired in `CustomersController` via PaymentsService injection.

- [ ] **Step 2: Update `DatabaseSchema.md`**

  Add the `Allocation`, `AllocationEvent` models (with FK rules and indices); document the `Vendor.customerId` field; document `Transaction.paymentReviewDismissedAt`; document `Invoice.amountPaid` / `amountOutstanding`. Note that `PARTIAL_PAID` was added to the `InvoiceStatus` enum and that the display order in the UI is `DRAFT → SENT → VIEWED → PARTIAL_PAID → PAID → VOID`.

- [ ] **Step 3: Update `modules_and_logic.md`**

  Add a Payments section documenting:
  - List page filter (income kind + unallocated + not-dismissed; ?showAll widens to any positive)
  - Apply modal three contexts (queue / invoice / transaction row menu) and the scoring signals
  - Allocations panel on invoice view + un-apply confirm
  - Vendor → Customer linkage field
  - Invoice manual status now restricted to DRAFT/VOID (derived otherwise)

- [ ] **Step 4: Update `DesignSystem.md`**

  Add the PARTIAL_PAID badge tone:

  ```
  PARTIAL_PAID: bg-amber-50 / text-amber-900 / border-amber-200
  ```

  Note: the existing SENT (blue) and PAID (emerald) tones are unchanged.

- [ ] **Step 5: Update `CLAUDE.md` Known gotchas**

  Add one bullet:

  > - **Invoice payment columns are denormalised**. `Invoice.amountPaid` / `amountOutstanding` are kept in sync by `recomputeInvoicePayment` inside every allocation transaction. Don't write them directly from outside `PaymentsService`. The manual status control on the invoice edit page is gated to `DRAFT` / `VOID` — `SENT`/`VIEWED`/`PARTIAL_PAID`/`PAID` are derived; flipping them by hand will be overwritten on the next allocation event.

- [ ] **Step 6: Commit**

  ```bash
  git add CLAUDE.md Architecture.md DatabaseSchema.md modules_and_logic.md DesignSystem.md
  git commit -m "docs: invoice payment matching (Phase D) — modules, schema, design, gotcha"
  ```

---

## Done

After Task 24:

1. Run the full backend test suite once more:
   ```bash
   docker exec simplebooks-backend-1 npm test
   ```
   Expected: all `payments/*.spec.ts` tests pass alongside the existing `ai/*` specs.

2. Smoke-test the full user flow in the browser:
   - Import or hand-create a positive INCOME-categorised transaction.
   - Open `/banking/payments`, click Apply.
   - Apply against 1-3 SENT invoices; confirm statuses transition correctly.
   - Open the invoice; the Allocations panel shows the entry; un-apply works.
   - Open `/transactions`, use the row menu to apply against any transaction.
   - Toggle "Show all positive" and dismiss a non-customer payment.

3. Verify no stray `down -v` is required — the entire schema rollout is additive.
