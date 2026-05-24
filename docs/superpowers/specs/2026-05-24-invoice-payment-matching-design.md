# Invoice Payment Matching — Design

> **Status:** approved design, ready for plan
> **Date:** 2026-05-24
> **Author:** brainstormed with Claude
> **Predecessors:** Phase A (Banking import) · Phase B (Rules) · Phase C (AI categorisation)

## Goal

Match bank transactions to invoices and record the allocation. A single deposit can pay multiple invoices, an invoice can be paid by multiple deposits, overpayments stay as customer credit, and every allocation is user-approved with a full audit trail.

## Non-goals (v1)

- Supplier-side payment matching (only customer invoices in v1).
- FX / multi-currency.
- Refund flow. Overpayment is **always** customer credit — never refunded out of the system.
- Automatic apply on perfect-score matches. The "trust exact-amount matches" toggle is a future improvement.
- Nightly reconciler. `recomputeInvoicePayment` is idempotent and called transactionally, so drift shouldn't occur. If suspected, a one-shot admin endpoint is a future improvement.
- Retention job for `AllocationEvent` rows.

## Architecture

The schema gap that gates everything else: there is no link today between `Transaction` and `Invoice`. `Invoice.status` is a flag and `totalAmount` exists; there is no `amountPaid`, no allocation table, no row-level link to the bank deposit that settled the invoice.

Approach: a many-to-many `Allocation` join table sits between `Transaction` and `Invoice`. Each row records one allocated amount in one direction. The `Invoice.amountPaid` / `Invoice.amountOutstanding` columns are denormalised aggregates of those rows, recomputed inside the same Prisma transaction as any allocation change. Invoice status is derived from `(amountPaid, viewedAt, sendAttempts, manualVoid)`. Customer credit is derived from the unallocated remainder of transactions linked (via `Vendor.customerId`) to that customer — no separate credit table.

Scoring is deterministic (no LLM): six signals with fixed point values, plus a separate bundle-suggestion path that detects when one deposit covers 2 or 3 invoices summed. Every apply, every un-apply writes to an append-only `AllocationEvent` audit log.

The user flow: a new `/banking/payments` review queue mirrors `/transactions/ai-review`. From a queued transaction the user opens an `ApplyPaymentModal`, sees scored candidates, picks invoices, adjusts amounts, confirms. From an invoice the user clicks "Receive payment" and gets the same modal pointed the other direction. Un-applying happens from an Allocations panel on the invoice view.

## Tech stack

No new dependencies. NestJS + Prisma backend, Next.js client. Same Decimal handling as Phase A/B (Prisma Decimal → string over JSON, wrap reads in `Number(...)` on the frontend before maths). Same audit pattern as `CategorisationEvent` (append-only, snapshots on delete). Same review-queue UX pattern as Phase C.

---

## 1. Schema changes

All additive — survives `prisma db push --accept-data-loss` without `down -v`.

### New table — `Allocation`

The many-to-many join between `Transaction` and `Invoice`.

```prisma
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
```

`onDelete: Cascade` on the transaction side — deleting a transaction cleans up its allocations (and the invoice statuses recompute via a hook in the delete service). `onDelete: Restrict` on the invoice side — you must un-apply first before an invoice can be deleted, so allocations never dangle.

### New table — `AllocationEvent`

Append-only audit log. Snapshots fields so a hard-deleted Allocation still leaves a readable trail.

```prisma
enum AllocationEventType {
  CREATED
  DELETED
}

enum AllocationEventSource {
  USER
}

model AllocationEvent {
  id                  String                @id @default(uuid())
  eventType           AllocationEventType
  transactionId       String                // snapshot — not an FK
  invoiceId           String                // snapshot — not an FK
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

Note: `transactionId` and `invoiceId` are plain string snapshots, **not** FKs. This way, if a transaction or invoice is later deleted, the audit row survives.

### Invoice changes

Add denormalised columns and a new status value:

```prisma
// InvoiceStatus enum already contains PARTIAL_PAID from prior work
// (alongside FAILED_TO_SEND, which is unrelated to payment matching).
// No enum changes needed. Spec value names (PARTIAL_PAID etc.) match the
// existing schema verbatim.

model Invoice {
  // ...existing fields...
  amountPaid        Decimal @db.Decimal(12, 2) @default(0)
  amountOutstanding Decimal @db.Decimal(12, 2) @default(0)

  allocations Allocation[]   // back-relation
}
```

Backfill (one-shot on first boot after deploy, idempotent):

```sql
UPDATE "Invoice"
SET "amountPaid"        = CASE WHEN status = 'PAID' THEN "totalAmount" ELSE 0 END,
    "amountOutstanding" = CASE WHEN status = 'PAID' THEN 0 ELSE "totalAmount" END
WHERE "amountPaid" = 0 AND "amountOutstanding" = 0;
```

Lives in `backend/src/payments/backfill.ts` and runs from the NestJS lifecycle hook in `PaymentsModule`. Guarded so repeated boots are no-ops.

### Vendor change

Optional customer linkage.

```prisma
model Vendor {
  // ...existing fields...
  customerId String?
  customer   Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)
}
```

`onDelete: SetNull` so deleting a customer doesn't break the vendor row — the link just clears.

### Customer change

Back-relation only:

```prisma
model Customer {
  // ...existing fields...
  vendors Vendor[]
}
```

### Transaction change

Tracking for the "Not a customer payment" dismissal:

```prisma
model Transaction {
  // ...existing fields...
  paymentReviewDismissedAt DateTime?
  allocations              Allocation[]
}
```

### Migration notes

- `aiMiningThreshold` default just got changed from 5 to 3 — this Payment work piles onto that. Both `prisma db push` cleanly.
- `InvoiceStatus.PARTIAL_PAID` already exists in the enum (added in prior work). No enum alteration needed.
- The backfill runs **after** `prisma db push` (in the application lifecycle, not Prisma's). One INSERT-less UPDATE means a 50 ms operation even on large invoice tables.

---

## 2. Status recompute helper

Single backend function `recomputeInvoicePayment(db: Prisma.TransactionClient, invoiceId: string)`. Idempotent. Called inside the same Prisma transaction as any allocation create or delete.

```
allocSum = sum(Allocation.amount where invoiceId = X)

amountPaid        = allocSum
amountOutstanding = totalAmount - allocSum

status =
  if existing status == VOID               → VOID         (terminal, never auto-changed)
  else if allocSum == totalAmount          → PAID
  else if allocSum > 0                     → PARTIAL_PAID
  else if viewedAt != null                 → VIEWED
  else if sendAttempts > 0                 → SENT
  else                                     → DRAFT
```

**Invariants:**
- Idempotent: running twice on a stable invoice changes nothing.
- VOID is a manual terminal state. Once an invoice is VOID, allocations are rejected up-front (status guard in `POST /payments/apply`). VOID never auto-transitions from this helper.
- `viewedAt` is sticky — un-applying a PAID invoice with a public-link view in its past goes back to VIEWED, not SENT.

---

## 3. Scoring & matching

### Per-invoice score

`scoreInvoice(tx, invoice, customer): number` is the unit-tested core. Built from six signals:

| Signal | Points | Detection rule |
|---|---|---|
| Invoice number in description | +60 | regex `/INV[-\s]?0*(\d{3,6})/i` — captured number equals `invoice.invoiceNumber`. Leading zeros tolerated. |
| Exact amount match | +40 | `transaction.unallocated == invoice.amountOutstanding` (Decimal equality — zero tolerance) |
| Customer name token in description | +15 | any whitespace-split token of `customer.displayName` with `length >= 4` appears as a substring of `transaction.description`, case-insensitive |
| Date plausible | +10 | `transaction.date >= invoice.invoiceDate` AND `transaction.date <= invoice.invoiceDate + 60 days` |
| Already partial | +5 | `invoice.status == PARTIAL_PAID` (remainder is more likely here) |

Each signal contributes independently; the score is the sum. A "Why this match" tooltip surfaces every signal that fired with its points.

Tokens shorter than 4 chars are dropped to avoid generic-word collisions ("LTD", "PTY", "THE"). `customer.displayName` is whatever the existing Customer schema uses — likely a single `name` column. If the displayName contains both first and last names, both qualifying tokens count, but each only once per signal.

### Candidate set

The set of invoices to score:

- **If `transaction.vendor.customerId` is set:** scope to that customer's invoices in `SENT | VIEWED | PARTIAL_PAID`. This is the prime path.
- **If not:** scope is empty until the user picks a customer in the modal. Once picked, repopulate.
- **"Apply to any invoice" escape hatch:** scope widens to all open invoices across all customers, with the candidate list paginated and searchable.

Always exclude `DRAFT`, `PAID`, `VOID`. The score never auto-applies — it only orders the list.

### Bundle suggestion

Surfaces as a single chip above the candidate list: "Looks like this pays these 3 invoices — INV-1011 $1,200 + INV-1012 $1,500 + INV-1013 $800 = $3,500".

Detection: search combinations of 2 and 3 invoices from the customer's open set (oldest-first) whose `amountOutstanding` values sum **exactly** to `transaction.unallocated`. First match wins. Skip the combinatorial scan if the customer has more than 8 open invoices.

Clicking the chip pre-checks those invoices with their outstanding amounts pre-filled. The user still confirms.

### Conservation invariants enforced in `/payments/apply`

All-or-nothing inside one Prisma transaction. Any violation rolls back.

- `allocations[i].amount > 0`
- `allocations[i].amount <= invoice.amountOutstanding` (no overpaying a single invoice — surplus stays as transaction credit)
- `sum(allocations[].amount) <= transaction.unallocated`
- Every targeted invoice has `status ∈ {SENT, VIEWED, PARTIAL_PAID}` at the moment of apply (rejects DRAFT, PAID, VOID)
- Tolerance: **zero** — these are Decimal columns; be exact

---

## 4. API surface

New `payments` module, route prefix `/payments`.

| Method | Path | Body / Query | Purpose |
|---|---|---|---|
| GET | `/payments/queue?showAll=` | — | Lists queued transactions (default filter — see §5). |
| GET | `/payments/queue/count` | — | `{count}` for the sidebar badge. |
| GET | `/payments/candidates/:transactionId` | — | `{candidates: ScoredInvoice[], bundleSuggestion?: BundleHint}`. |
| POST | `/payments/apply` | `ApplyDto` | Writes allocations + audit + status recompute + optional vendor binding. Returns the updated transaction + invoices. |
| DELETE | `/payments/allocations/:id` | — | Removes one allocation, recomputes invoice, logs event. |
| POST | `/payments/dismiss/:transactionId` | — | Sets `paymentReviewDismissedAt`. |
| POST | `/payments/undismiss/:transactionId` | — | Clears the timestamp. |
| GET | `/customers/:id/credit` | — | `{credit: number, transactions: [{id, date, amount, remaining, description}]}` — drives the credit strip in the modal. |

### `ApplyDto`

```ts
class ApplyDto {
  @IsUUID() transactionId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AllocationLineDto)
  allocations!: AllocationLineDto[];
  @IsUUID() @IsOptional() bindVendorToCustomerId?: string;
}

class AllocationLineDto {
  @IsUUID() invoiceId!: string;
  @IsNumberString() amount!: string;   // Decimal as string per existing convention
}
```

Note: per the bug just fixed in `ai.dto.ts`, **every nested field needs a class-validator decorator** or ValidationPipe `whitelist: true` strips it. The `@ValidateNested` + `@Type` combo handles the array; each `AllocationLineDto` field gets its own decorator.

### Error shapes

- `400 Bad Request` — conservation violations (`amount <= 0`, `amount > outstanding`, `sum > unallocated`, empty allocations array, invoice not in open status). UI surfaces the violating row inline.
- `404 Not Found` — transaction / invoice / allocation not present.
- `409 Conflict` — a candidate invoice's status changed between when the modal was opened and the apply hit (e.g. someone else apply-paid it). UI: "Some invoices changed since you opened this — refreshing." then re-fetches candidates.

Successful `POST /payments/apply` returns `200` with the updated transaction (including `unallocated` and `allocations`) and the affected invoices (with new statuses) so the caller can rerender without a refetch.

---

## 5. Queue filter (option A)

The Payments review queue (`GET /payments/queue`) is defined by:

- `Transaction.amount > 0` (income only)
- `Transaction.category.kind == 'INCOME'`
- `Transaction.paymentReviewDismissedAt IS NULL`
- `Transaction.amount - sum(Allocation.amount where transactionId = this) > 0` (has unallocated remainder)
- Sort: `Transaction.date DESC`

Query param `?showAll=true` drops the `category.kind == INCOME` filter — the escape hatch for users who want to find a transaction that isn't categorised correctly yet. The category filter remains the default to keep noise (interest, refunds, supplier reimbursements) out.

`/payments/queue/count` runs the same query with `select count(*)` — used by the sidebar badge polled every 30 s.

---

## 6. Customer credit (derived)

No table. Computed on demand for `GET /customers/:id/credit`:

```sql
SELECT
  t.id, t.date, t.amount, t.description,
  t.amount - COALESCE(SUM(a.amount), 0) AS remaining
FROM "Transaction" t
JOIN "Vendor" v ON v.id = t."vendorId"
LEFT JOIN "Allocation" a ON a."transactionId" = t.id
WHERE v."customerId" = :customerId
  AND t.amount > 0
GROUP BY t.id
HAVING t.amount - COALESCE(SUM(a.amount), 0) > 0
ORDER BY t.date DESC;
```

`{credit: number}` is the sum of `remaining` across the result set. The transactions array is what the modal's "Apply existing credit" affordance lists.

When the user opens `ApplyPaymentModal` for a transaction belonging to Customer X, the modal also fetches `/customers/X/credit` so it can show the strip "Customer credit available: $K.KK from N earlier transactions" with a "Use existing credit instead →" link.

The credit *isn't* a balance entity that gets debited — it's a view over the same `Allocation` rows. Applying credit to a new invoice is just another `POST /payments/apply` against the older transaction.

---

## 7. Frontend UX

### New page — `/banking/payments`

The review queue. Same structural shape as `/transactions/ai-review`.

- **Header:** `Payments to review (N pending)` + toggle `[ ] Show all positive` (toggles `?showAll=true`).
- **Each row:** `[date] · [amount] · [description] · [account] · [vendor.name (→ customer.name if linked)]` → right-aligned actions: **[Apply]** and **[Not a customer payment]**.
- **Empty state:** "Nothing to review. Bank transactions categorised as Income — Customer payments will appear here. [Show all positive instead]".

### Sidebar entry

Under **Banking** group, with badge from `/payments/queue/count` polled every 30 s. Add to the existing `nav` array in `sidebar.tsx`.

```ts
{ href: "/banking/payments", label: "Payments", badge: 'paymentsCount' }
```

The badge wiring follows the existing AI Review pattern.

### `ApplyPaymentModal`

One component, three contexts. Variant is keyed by the launch context.

**Context A — from the Payments queue:**
1. Header: date · amount · description · account.
2. **If `transaction.vendor?.customerId` is set:** load candidates immediately. Show scored list (top 20 by default, "Show all" expands). Bundle chip above the list if any.
3. **If not:** first step is a **Customer picker** (Select with search across customers). Below it: `[ ] Bind this vendor to [Customer] for next time` — the checkbox writes `Vendor.customerId` on apply via `bindVendorToCustomerId` on `ApplyDto`.
4. **Candidate list:** each row has checkbox · invoice# · date · outstanding · auto-filled amount field (defaults to `min(transaction.unallocated, invoice.amountOutstanding)` on check, editable) · hover-tooltip showing the score breakdown.
5. **Footer:** `Applied: $X.XX · Remaining: $Y.YY · Credit to customer: $Z.ZZ` (the remainder becomes credit automatically) · `[Cancel]` · `[Apply $X.XX]`.
6. **Below the list:** collapsible `▸ Apply to any invoice` — paginated, searchable cross-customer list (the escape hatch from §3).
7. **Customer credit strip** (only renders if `/customers/X/credit` returns `credit > 0`): "Customer credit available: $K.KK from N earlier transactions. [Use existing credit instead →]" — the link closes this modal and opens it against the older transaction.

**Context B — from an invoice's "Receive payment" button:**

Pointed the other direction.
1. Header: invoice# · customer · total · outstanding.
2. List: **transactions with `remaining > 0` for this customer** (newest first). Each row: checkbox · date · description · remaining · auto-filled amount field defaulting to `min(invoice.amountOutstanding, tx.remaining)`.
3. Includes prior-overpayment credit naturally — credit-bearing transactions still have `remaining > 0`.
4. Footer: `Applied: $X.XX of $Y.YY outstanding · [Cancel] · [Apply]`.

**Context C — from `/transactions/:id` row menu "Apply to invoices":**

Same as Context A. Lets the user pay-match a transaction they previously dismissed, or one whose category isn't in the queue's INCOME filter. Useful for cleanup.

### Allocations panel on invoice view

Sits below the line items, above the totals block on the invoice view/edit page.

- Lists each Allocation in date order (newest first): `[date] · [link to transaction with truncated description] · $X.XX · [trash icon]`.
- Trash icon → confirm modal: "Un-apply $X.XX from this invoice? The invoice will revert to PARTIAL_PAID." (or SENT/VIEWED depending on the resulting state — text computed on the fly).
- Empty state: "No payments allocated yet. [Receive payment]" (button opens Context B).

### Vendor edit page

Add a `customerId` Select (optional, with a "— none —" option). Helper text under the field: "Linking a vendor to a customer enables automatic candidate matching in the Payments queue."

### Transaction row menu

Add "Apply to invoices" as the first item (above Edit, with a separator below — sits visually distinct as a payment action). Opens Context C.

### `PARTIAL_PAID` status visuals

The existing invoice status tones live in the invoices-list component. Add `PARTIAL_PAID`:

- Badge tone: amber (`bg-amber-50 text-amber-900 border-amber-200`), distinct from SENT (blue) and PAID (emerald).
- Filter pill: appears between SENT and PAID in the filter row.

The status enum order in the schema isn't display order — the frontend hard-codes the display sequence `DRAFT → SENT → VIEWED → PARTIAL_PAID → PAID → VOID`.

---

## 8. Audit & errors

### `AllocationEvent` invariants

- Every successful `POST /payments/apply` row → one `AllocationEvent{eventType: CREATED}` per Allocation line, all within the same Prisma transaction.
- Every successful `DELETE /payments/allocations/:id` → one `AllocationEvent{eventType: DELETED}` capturing the row's `transactionId`, `invoiceId`, and `amount` *before* the hard delete.
- `invoiceStatusBefore` / `invoiceStatusAfter` are captured around the `recomputeInvoicePayment` call.
- Failed apply (any conservation violation) → Prisma transaction rolls back → **no** events written.

### Concurrency

Single-tenant app, no row-level locks beyond what Prisma transactions provide. The 409-on-status-changed path is the safety net for the rare case where two apply requests target the same invoice. Re-fetching candidates after a 409 is enough.

---

## 9. Testing

Jest + ts-jest, mirroring the `ai-rule-drafter` and `ai-client` patterns. Tests live in `backend/src/payments/**/*.spec.ts`.

| Layer | Coverage |
|---|---|
| Unit: `scoreInvoice(tx, invoice, customer)` | Each signal in isolation + combinations. Table-driven. Includes: invoice# present but wrong number (no points), exact amount with no other signals (40 only), fuzzy customer name with 3-char token (NOT counted), date one day before invoiceDate (NOT counted), date exactly invoiceDate (+10), date `invoiceDate + 60d` (+10), date `invoiceDate + 61d` (no points). |
| Unit: `findBundleSuggestion(tx, invoices)` | 2-of-3 sum match, 3-of-3 sum match, no match, > 8 invoices early-skip returns null, duplicate-amount invoices in the set (picks oldest combo), zero-outstanding invoice excluded. |
| Unit: `recomputeInvoicePayment(invoice, allocs)` | All 6 status outcomes including VOID-is-terminal, viewedAt stickiness across PAID → un-applied, totalAmount = 0 edge case (treated as PAID at 0 allocations? — explicit decision: status follows the table; 0 = 0 satisfies `allocSum == totalAmount` so PAID. Edge case but consistent). |
| Integration: `POST /payments/apply` happy path | 3-invoice spread, statuses transition to PAID + PARTIAL_PAID + PAID, AllocationEvent rows written, transaction.unallocated decreases correctly. |
| Integration: `POST /payments/apply` partial | One invoice partially paid leaves PARTIAL_PAID + credit on transaction. |
| Integration: `POST /payments/apply` overpay rejected | Allocation > single invoice outstanding → 400 + rollback. |
| Integration: `POST /payments/apply` race | Status changed between candidate fetch and apply → 409. |
| Integration: `POST /payments/apply` vendor binding | `bindVendorToCustomerId` writes `Vendor.customerId`. |
| Integration: `DELETE /payments/allocations/:id` | Status drops PAID → PARTIAL_PAID → SENT, then back to VIEWED if `viewedAt` is set, AllocationEvent DELETED rows written, transaction.unallocated increases. |
| Integration: `GET /customers/:id/credit` | Returns correct unallocated sum across multiple transactions, ignores fully-allocated and dismissed transactions, ignores transactions where vendor isn't linked to the customer. |
| Integration: `GET /payments/queue` | Income-kind + unallocated + not-dismissed; `?showAll=true` widens to any positive. |
| Integration: backfill | Existing PAID invoices get `amountPaid = totalAmount`, others get `amountOutstanding = totalAmount`. Idempotent on second run. |

---

## 10. Risks & open questions

- **Decimal equality at the conservation boundary.** Prisma Decimals → JS strings over JSON. The apply endpoint must compare via the `Decimal` class re-exported from `@prisma/client/runtime/library` (Prisma's bundled `decimal.js-light`). Don't compare floats — drift on a $3,500 deposit split across three invoices can be a cent off. Use `Decimal.eq()` / `Decimal.lte()` for every conservation check.
- **Manual status override.** Today an operator can manually set a status from the invoice edit page. After this lands, that path needs to be reconciled: a manual flip to `PAID` with `amountPaid < totalAmount` is incoherent. Decision: the manual status control is removed from the edit page for `SENT/VIEWED/PARTIAL_PAID/PAID` — those are derived. Manual `VOID` and `DRAFT` remain. (Listed as out-of-scope to remove the field entirely; just gate the writes.)
- **Existing invoices with `status = PAID` but no allocations.** Real historical data. The backfill sets `amountPaid = totalAmount` to keep the invariant, but no Allocation rows exist. If someone tries to un-apply, the Allocations panel is empty — there's nothing to un-apply. This is acceptable: those invoices are sealed history.
- **Sorting transactions in the credit strip.** Newest first feels right, but "use the oldest credit first" is more accountant-friendly (FIFO). Default: newest first. Future improvement: a preference.
- **Duplicate Allocation rows for the same `(transactionId, invoiceId)`.** Allowed — a customer might partially pay an invoice on Tuesday and again on Friday, both from the same transaction (rare but possible if you split a deposit across two apply sessions). No unique constraint. The Allocations panel aggregates them visually.

---

## Future improvements (post-v1)

- Trust toggle for exact-amount auto-apply.
- AI-assisted matching (Tier C) for the long-tail unmatched: pass open invoices + transaction description to the LLM, surface as a separate "AI suggestions" section in the modal. Reuses the Phase C `AiClient` chain.
- Nightly `recomputeInvoicePayment` reconciler with drift report.
- FIFO-credit preference.
- Supplier-side payment matching for bills you receive.
- Refund flow (out-of-scope for v1 per design).
- `AllocationEvent` retention job once the table grows.
