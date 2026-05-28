# Customer Statements (Phase E) — Design

Date: 2026-05-27

## Goal

A new page at `/statements` (already in the sidebar under Reports → Statements, currently a `ComingSoon` stub) that renders an on-screen Customer Statement, with two actions: **Send** (email the statement as a PDF attachment to the customer) and **PDF** (download/open the same statement as a standalone PDF).

The on-screen layout and the PDF layout both follow the sample provided by the user: a From / To address block, a centered "Statement of Accounts" title with date range, a 4-line summary card (Opening Balance / Invoiced Amount / Amount Received / Balance Due), and a transaction table.

## Scope

- One statement = **one Customer + one Billing Company**. Only invoices issued by that billing company are included.
- `Customer.billingCompanyId` is treated as effectively required (every Customer has one in practice — enforced by the edit form). When a Customer is picked, the Billing Company dropdown pre-fills with their assigned billing company.
- Statements are computed on-the-fly from `Invoice` + `Allocation` + `Transaction` data. **No new DB tables, no schema changes — Phase E is fully additive.**

## What's out of scope

- Multiple-billing-company aggregation per customer (one billing co per statement).
- A `StatementEmailTemplate` DB row. Subject and body defaults are hardcoded in `MailService.sendStatement` — confirmed acceptable for now; can be added later if customers want editable defaults.
- Bulk statement send (e.g. "email statements to all customers"). Single-customer only.
- Saving / archiving rendered statements. Each render is fresh.

## Data sources

| Source | Used for |
|---|---|
| `Customer` (with `billingCompany` include) | Customer dropdown options; "To" address block |
| `BillingCompany` | Billing-company dropdown options; "From" header block |
| `Invoice` (filtered by `customerId`, `billingCompanyId`, `status != VOID`) | Invoice rows + opening-balance carry-forward |
| `Allocation` (joined to `Transaction` and `Invoice`) | Payment rows + opening-balance payment side |
| `Preferences.timezone` | Date-range filter conversion via `localStartOfDay` / `localEndOfDay` |

## Math (the load-bearing part)

### Opening balance

When the user sets a "From" date:

```
openingBalance =
    Σ totalAmount of invoices where
        customerId = X
        AND billingCompanyId = Y
        AND status != 'VOID'
        AND invoiceDate < from
  − Σ amount of allocations where
        invoice satisfies the same three conditions
        AND transaction.date < from
```

When "From" is null (default — "all time"), `openingBalance = 0`.

This is accounting-correct: opening balance is what the customer owed at the start of the period, with payments that arrived before the period already netted off. A payment that lands *inside* the period is shown as a body row instead.

### Body rows

Two row types, both filtered to `date in [from, to]` (where date-bounds are open-ended when null):

**Invoice row** — one per invoice:
```
where:
  customerId = X, billingCompanyId = Y, status != 'VOID',
  invoiceDate in [from, to]
fields:
  date    = invoiceDate
  type    = "INVOICE"
  details = `Invoice No ${invoiceNumber}`
  amount  = totalAmount
  payment = 0
```

**Payment row** — one per Transaction (grouped):
```
where:
  transaction has at least one allocation to an invoice in scope
    (scope = customerId X, billingCompanyId Y, status != VOID)
  AND transaction.date in [from, to]
fields:
  date    = transaction.date
  type    = "PAYMENT"
  details = `Payment Received $${amountFormatted} on ${dd/MM/yyyy of tx.date}`
  amount  = 0
  payment = Σ of THIS transaction's allocations to scope invoices
            (cross-company allocations, allocations to VOIDs, and any
             unallocated remainder are NOT included — keeps balance
             reconciling when filtered by billing company)
```

### Sort order

Rows are sorted by `date` ascending. **Same-day tiebreaker: invoice rows precede payment rows.** This matches the natural "invoice issued, then paid" reading order. Among same-day same-type rows, deterministic tiebreaker is `invoiceNumber` ascending (invoices) / `transaction.id` ascending (payments).

### Running balance

Computed in TS after the sort:

```
balance[-1] = openingBalance
balance[i]  = balance[i-1] + amount[i] − payment[i]
```

(The opening balance is the seed; subsequent rows shift it by their amount/payment delta.)

### Summary card

| Field | Formula |
|---|---|
| Opening Balance | `openingBalance` |
| Invoiced Amount | `Σ amount of body invoice rows` (does NOT include opening — opening sits separately above) |
| Amount Received | `Σ payment of body payment rows` |
| Balance Due | `openingBalance + invoicedAmount − amountReceived` |

Validates against the sample: `2238.50 + 9749.60 − 6233.30 = 5754.80` ✓.

## Backend

### New module: `backend/src/statements/`

```
statements.module.ts
statements.controller.ts
statements.service.ts
dto.ts
```

`StatementsModule` imports `PrismaModule`, `PdfModule`, `MailModule`. Exports nothing.

### Endpoints

All require `customerId` (UUID) and `billingCompanyId` (UUID); `from` and `to` are optional `YYYY-MM-DD`.

| Verb | Path | Returns |
|---|---|---|
| `GET` | `/statements` | JSON statement payload (see below) — used by the page to render on-screen |
| `GET` | `/statements/pdf` | `application/pdf` stream, `Content-Disposition: inline; filename="Statement-<CustomerNumber>-<from>-<to>.pdf"` |
| `GET` | `/statements/send-context` | Pre-fill values for the Send dialog (from / to / cc / bcc / subject / html) |
| `POST` | `/statements/send` | Sends the statement email with the PDF attached. Body: `{ customerId, billingCompanyId, from?, to?, from, to, cc?, bcc?, subject, html }` (the first `from`/`to` are date filters; the second pair are email addresses — DTO field names will disambiguate, see below) |

DTO disambiguation: dates are `dateFrom` / `dateTo`; emails are `fromEmail` / `toEmail` / `ccEmail` / `bccEmail`. JSON query params for GETs use `dateFrom` / `dateTo`.

### JSON payload shape

```ts
type StatementResponse = {
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
  };
  dateFrom: string | null;            // ISO date (YYYY-MM-DD) or null
  dateTo: string | null;
  openingBalance: string;             // Decimal-as-string, frontend wraps in Number()
  rows: Array<{
    date: string;                     // YYYY-MM-DD
    type: 'INVOICE' | 'PAYMENT';
    details: string;
    amount: string;                   // "0" when type === PAYMENT
    payment: string;                  // "0" when type === INVOICE
    balance: string;
  }>;
  summary: {
    invoicedAmount: string;
    amountReceived: string;
    balanceDue: string;
  };
};
```

### `StatementsService.getStatement`

1. Load `customer` and `billingCompany` rows; 404 if either missing.
2. Resolve `from` and `to` to UTC instants via `localStartOfDay(dateFrom, prefs.timezone)` / `localEndOfDay(dateTo, prefs.timezone)`. Null bounds → no SQL date filter.
3. Compute `openingBalance` via two Prisma queries (sum-totalAmount + sum-allocations-amount-where-tx.date<from). When `from` is null, skip and seed 0.
4. Fetch invoice rows (one query, include nothing).
5. Fetch payment rows: query allocations where `invoice.customerId = X AND invoice.billingCompanyId = Y AND invoice.status != VOID AND transaction.date in [from, to]`, group by `transactionId` in TS, sum the `amount`, attach `transaction.date`.
6. Merge + sort by date asc, tiebreak per spec.
7. Walk the array computing running balance.
8. Compute summary; return payload.

All `Decimal` arithmetic uses `@prisma/client/runtime/library`'s `Decimal` (same pattern as `PaymentsService`) to avoid float drift. Frontend receives strings.

### PDF template: `backend/src/pdf/templates/customer-statement.tsx`

A new React-PDF template that visually mirrors the supplied sample. **Not registered in the user-pickable template rotation** (statements don't use the invoice template system). Registered in `templates/index.ts` only so `PdfService.renderStatement` can `getTemplateComponent('customer-statement')` or be wired directly.

Reuses the already-installed `@fontsource/source-sans-3` font.

Layout (single A4 page minimum; auto-paginates if rows overflow):
- **Top-right header**: billing company name (bold), ABN, accountsEmail (3 lines, right-aligned).
- **Left "To" block**: bold "To", customer name (bold), address.
- **Centered title**: "Statement of Accounts" (h1), date range below in a smaller font (`dateFrom To dateTo`, or "All transactions" when both null).
- **Summary card**: rounded grey box, 4 right-aligned rows: Opening Balance / Invoiced Amount / Amount Received / Balance Due, each with the dollar amount right-aligned.
- **Transactions table**: 6-column grid (Date / Transactions / Details / Amount / Payments / Balance), dark header bar, light row striping. Header row is `Date`, `Transactions` (= the type cell rendered as "Invoice" / "Payment Received" matching the sample's column label), `Details`, `Amount`, `Payments`, `Balance`.
- **Footer row**: `Balance Due` label and amount on a final row aligned right.

PDF filename: `Statement-<CustomerNumber>-<dateFrom>-<dateTo>.pdf` (with `all` when a bound is null).

`PdfService.renderStatement(payload)` parallels `renderInvoice` and returns `{ buffer, filename }`. The size-budget warning logic is reused.

### Mail extension: `backend/src/mail/mail.service.ts`

New method `sendStatement(payload, overrides)` parallels `sendInvoice`:

- Resolves SMTP config via the same `resolveConfigForCompany(billingCompanyId)` helper (extract this from the existing `resolveConfigForInvoice` if needed — both want "config for billing company X").
- From default = `billingCompany.accountsEmail`.
- To default = `customer.billingEmail1` (required — throw a clear error if missing).
- CC default = `customer.billingEmail2`.
- BCC default = `billingCompany.invoiceBcc`.
- Subject default = `Statement for <customer.name> · <dateFrom> – <dateTo>` (using "All transactions" when bounds are null).
- Body default = hardcoded short HTML: greeting, "Please find your statement attached", payment-details snippet from `billingCompany.paymentDetails` if present, sign-off with billing company name. No `EmailTemplate` lookup.
- Attachment: always — render statement PDF via `PdfService.renderStatement` and attach as `Statement-<...>.pdf`.

No retry queue / BullMQ involvement (statements aren't safety-critical; failure is shown directly in the dialog). If a queue is later needed, the existing `invoice-mail.processor.ts` is a model to copy.

`MailService.getStatementSendContext(payload)` returns the pre-fill envelope for the Send dialog (same shape as `getInvoiceSendContext` minus invoice-specific fields).

### Module wiring

- `app.module.ts` adds `StatementsModule` to `imports`.
- `MailModule` already exports `MailService` and `PdfService` (used by invoices) — `StatementsModule` adds them to its `imports`.

## Frontend

### Routes

- `frontend/app/statements/page.tsx` — replace the `ComingSoon` stub. Server component: loads `customers`, `billingCompanies`, `preferences` in parallel, hands off to the client component.

### Components

```
frontend/components/statements/
  statements-page.tsx        client — filters + on-screen statement + action buttons
  send-statement-dialog.tsx  client — mirrors send-invoice-dialog.tsx
```

### `statements-page.tsx`

A single-card layout mirroring `report-page.tsx`:

```
[Card]
  [Filter row]: Customer • Billing Company • Date From — Date To • [Send] [PDF]
  ─────
  [From / To address blocks side by side]
  [Summary card: Opening / Invoiced / Received / Balance Due]
  ─────
  [Table: Date / Type / Details / Amount / Payment / Balance]
  [Balance Due footer row]
```

Behaviour:
- Filters are controlled state; refetch via `useEffect` debounced on filter change (mirrors `ReportPage`).
- **Customer dropdown** lists active customers, sorted by `customerNumber`, displayed as `<customerNumber> — <name>`.
- **Billing Company dropdown** lists active companies. On Customer change, auto-set `billingCompanyId = customer.billingCompanyId` (user can still override).
- **Date inputs** use `<Input type="date" />` matching reports. Both empty by default. When empty → backend treats as null → "All transactions" mode.
- **Send button** is `Mail` icon + "Send". Disabled until both Customer and Billing Company are picked AND a statement is loaded. Opens `<SendStatementDialog>`.
- **PDF button** is `Download` icon + "PDF". Same enabled condition. Action: `window.open(statementPdfUrl(params), '_blank')` — opens inline in a new tab (browser default for `inline` content-disposition).
- **Empty state**: when no Customer is picked, show a centered "Pick a customer to view their statement" hint instead of the table.
- **Loading state**: skeleton on the summary card + table.
- **Error state**: rose-50 alert at the top of the card with the API error message.

Money is formatted via `Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })` (same helper as Reports). Dates rendered `dd/MM/yyyy`.

### `send-statement-dialog.tsx`

Mirrors `send-invoice-dialog.tsx`:
- Phases: `loading` → `compose` → `sending` → `sent` / `error`.
- Loads `/statements/send-context?...` on open, populates From / To / CC / BCC / Subject / Body.
- Body is rendered read-only (consistent with invoice dialog — body comes from the hardcoded default).
- Submit posts `/statements/send` with all editable fields. On 2xx → `sent` phase; on error → `error` phase with retry.
- No "Attach PDF" toggle — always attached.

### API helpers: `frontend/lib/statements.ts`

```ts
export type StatementParams = {
  customerId: string;
  billingCompanyId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export function getStatement(p: StatementParams): Promise<StatementResponse>;
export function getStatementSendContext(p: StatementParams): Promise<StatementSendContext>;
export function sendStatement(p: StatementParams & SendOverrides): Promise<{ status: 'SENT' }>;
export function statementPdfUrl(p: StatementParams): string;  // returns absolute URL for window.open
```

### Type additions: `frontend/lib/types.ts`

Add `StatementResponse`, `StatementSendContext`, `StatementRow` exported types matching the backend payload shape.

## UI tokens / design adherence

Follows `DesignSystem.md` per CLAUDE.md:

- Page bg `#EDEEF3` (inherited from `app-shell.tsx`).
- Card `rounded-lg`, buttons / inputs `rounded-[0.3rem]`.
- Font Noto Sans (inherited).
- Filter panel reuses the same flexbox row + `text-slate-600` labels as `ReportPage`.
- Send and PDF buttons use the `Button variant="outline" size="sm"` pattern from the Export button in `ReportPage`.
- Icons: lucide-react (`Mail` for Send, `Download` for PDF — matches the existing Export button).

## Edge cases handled

| Case | Handling |
|---|---|
| Customer / Billing Company missing | 404 from backend; frontend shows the API error in the error alert. |
| No transactions in range, opening > 0 | Render statement with the opening line in the body table, balance = opening, Balance Due footer correct. |
| No transactions and opening = 0 | Render the summary card with zeros and an empty table with a "No transactions in this period" inline message. |
| Customer has no `billingEmail1` on Send | Backend `sendStatement` throws a clear "Customer has no primary billing email" error; surfaces in the dialog's error phase. |
| Allocation to a VOID invoice | Excluded from payment-row totals (rare; keeps math consistent with "VOIDs don't exist" rule). |
| `amountPaid` / `amountOutstanding` denormalised columns | Ignored — service computes payment math directly from `Allocation` rows. |
| Statement PDF for a customer with thousands of rows | React-PDF auto-paginates; size-budget warning logs if per-page bytes exceed the existing 180KB threshold. |

## Performance

Single page-load, all queries are indexed: invoice fetch hits `(customerId, billingCompanyId, status, invoiceDate)` (existing indexes on `customerId` and `billingCompanyId` are sufficient); allocation fetch hits `Allocation.invoiceId` (indexed) and joins to `Transaction.date`. For a customer with 200 invoices and 400 allocations, this is well under 50ms locally. No pagination needed in the API — statements are by definition bounded.

## Documentation updates

- `modules_and_logic.md` — add a "Statements" section under Reports describing the page, filters, layout, math, and PDF/email behaviour.
- `Architecture.md` — add the `statements` module to the backend module list with its route prefix and the PDF/Mail extension points.
- `DatabaseSchema.md` — no changes (Phase E is fully additive at the schema level).
- `DesignSystem.md` — no changes (reuses existing tokens).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Opening balance math wrong | Unit-test the formula directly: a fixture with 3 invoices (pre-from, in-range, post-to) and 4 allocations across various dates, assert opening and each row's balance. |
| PDF layout breaks on long customer names / addresses | React-PDF wraps within its boxes; the template's address blocks use `flex` with `flexShrink`. |
| Allocation to VOID invoice math drift | Service-level filter `invoice.status != VOID` applied in *both* opening-balance and body queries. Single source of truth. |
| Statement email body too plain | Acceptable for v1. Editable templates are an explicit non-goal. |
| Timezone bugs (off-by-one days) | Use `localStartOfDay` / `localEndOfDay` per the CLAUDE.md gotcha. Tested via the same `Preferences.timezone` lookup pattern as reports. |
