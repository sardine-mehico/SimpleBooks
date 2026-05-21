# Recurring Invoices — Design Spec

**Status:** Approved (Sections 1–4) — pending user review before implementation plan.
**Date:** 2026-05-18.

## 1. Problem statement and intent

The existing `RecurringRule` model is a thin three-field placeholder (`name`, `amount`, `frequency`) and the BullMQ sweep generates a single-line-item invoice with a hard-coded 14-day due date. The user wants recurring invoices to be **first-class templates** that mirror the invoice editing UX — full line items with tax types, payment details inherited from the billing company, dynamic-field substitution at generation time — plus scheduling controls (start date, recurrence, sending option, active toggle).

The existing model is replaced wholesale: it doesn't have data the user cares about, and the new shape has no clean migration path from the old. A one-time `docker compose down -v` resets the database; the seed repopulates demo data including recurring schedules.

The generation processor stays a BullMQ minute-by-minute sweep but routes successfully-generated `SEND_DIRECTLY` invoices into the `InvoiceMailService.send` pipeline that was just built — so retry-with-backoff (4 attempts × 10 minutes), `FAILED_TO_SEND` status, and Telegram + Resend notifications are all reused, not reimplemented.

## 2. Data model

Three Prisma models change. All FK behavior matches the existing convention (`SET NULL` for soft references, `CASCADE` for composite children).

**Enum replacement note:** the existing `RecurringFrequency` enum (`DAILY / WEEKLY / MONTHLY / QUARTERLY / YEARLY`) is **deleted**; its expressive power moves into the new `RecurringSchedule` rows (a Settings-managed catalog) plus the `RecurringIntervalUnit` enum below. Schedule semantics like "Every 2 weeks" become representable, where the old fixed-frequency enum couldn't.

### 2.1 `RecurringSchedule` — new catalog (Settings-managed, similar shape to `TaxType`)

| Column | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `name` | `String @unique` | "Every 4 weeks", "Every month", "Every quarter" |
| `intervalUnit` | enum `RecurringIntervalUnit` (`DAYS / WEEKS / MONTHS / YEARS`) | |
| `intervalCount` | `Int` | >= 1; "Every 4 weeks" → unit `WEEKS`, count `4` |
| `isActive` | `Boolean @default(true)` | |
| `createdAt` / `updatedAt` | `DateTime` | |

Managed via a new Settings page `/settings/recurring-schedules` (tax-types-manager pattern: list + dialog create/edit + delete). Sidebar entry between "Tax Types" and "Dynamic Fields", icon `Repeat` from `@phosphor-icons/react`. Default sort: Active first, then Name asc.

### 2.2 `RecurringRule` — replaces existing entirely

| Column | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | UUID for parity with other tables (existing uses cuid) |
| `scheduleName` | `String` | Auto-derived `"<customer> - <schedule.name>"` and stored at save. Read-only in the UI. Re-derives whenever customer or recurring-schedule changes prior to save. |
| `startDate` | `DateTime` | User-picked. First generation runs on/after this date. |
| `recurringScheduleId` | `String?` FK → `RecurringSchedule` (SET NULL) | |
| `sendingOption` | enum `SendingOption` (`REVIEW_BEFORE_SENDING / SEND_DIRECTLY`) | |
| `active` | `Boolean @default(true)` | Sweep ignores inactive rules. |
| `nextRunAt` | `DateTime` | = `startDate` at create; advanced by `intervalCount × intervalUnit` after each generation. |
| `customerId` | `String?` FK → `Customer` (SET NULL) | |
| `billingCompanyId` | `String?` FK → `BillingCompany` (SET NULL) | Derived from customer at save (same pattern as `Invoice`). |
| `poNumber` | `String?` | Template default; copied onto every generated invoice. |
| `paymentDetails` | `String?` | Sanitized HTML. Auto-populates from billing company on customer change (same behavior as invoice form). |
| `internalNotes` | `String?` | |
| `terms` | `String?` | |
| `lineItems` | `RecurringRuleLineItem[]` | At least one required. |
| `createdAt` / `updatedAt` | `DateTime` | |

The existing `Invoice.recurringRuleId` back-pointer stays — every generated invoice tracks which rule produced it.

### 2.3 `RecurringRuleLineItem` — new

Mirrors `InvoiceItem`'s shape but **without computed totals**. Totals (lineAmount, taxAmount) are computed fresh per generation because line descriptions may contain dynamic-field tokens that resolve to different strings each run, and totals are independent of description anyway.

| Column | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `recurringRuleId` | `String` FK → `RecurringRule` (CASCADE) | |
| `itemId` | `String?` FK → `Item` (SET NULL) | Optional — same item-picker chevron UX from the invoice form. |
| `description` | `String` | May contain `{{month-year}}` / `{{invoice date}}` / `{{due date}}`. Resolved at generation time. |
| `unitPrice` | `Decimal(12,2)` | The "Amount" column. Quantity is never surfaced in the UI — always serialized as `1` at generation. |
| `taxTypeId` | `String?` | |
| `taxName` | `String?` | Snapshot of `TaxType.name` at save time. |
| `taxRate` | `Decimal(6,3)?` | |
| `position` | `Int @default(0)` | Source order. |

## 3. UI layout

### 3.1 List page — `/recurring`

Rebuilt list (existing read-only list replaced).

- **Columns:** Schedule Name · Customer · Recurring Schedule (name) · Next Run · Amount (sum of line item `unitPrice`, client-computed) · Sending Option · Active.
- **Search:** Schedule Name (text) · Customer (text).
- **Filter:** Recurring Schedule (select) · Sending Option (select) · Active (select).
- **Default sort:** Active first, then Schedule Name asc.
- **Action bar:** Filter button · "+ New recurring invoice" button.

### 3.2 Edit page — `/recurring/new` and `/recurring/[id]`

Four cards, top to bottom:

**Card 1 — Recurring Settings (new, this card is the only thing that's recurring-specific):**

| Row | Field |
|---|---|
| 1 | **Schedule Name** — read-only display, auto-filled `<customer> - <schedule.name>`. Empty until both are picked. Re-derives whenever customer or recurring-schedule changes. |
| 2 | **Start Date** (date) · **Recurring Schedule** (select from `/recurring-schedules` active rows) |
| 3 | **Sending Options** (select: *Review before sending* / *Send directly to client*) · **Active** (switch) |
| 4 | **PO Number** (text — moved here from the invoice-form right column; PO Number flows to every generated invoice as a template default) |

**Cards 2–4 — shared with the invoice form via the `<InvoiceBodyEditor>` child:**

- Card 2: Customer & Billing Company block (mirror of invoice form's "From" card). Right column is **removed entirely** on the recurring form — its fields (Invoice Number, Invoice Date, Due Date, Status) belong on generated invoices, not the template.
- Card 3: Line Items (mirror of invoice form's line-items card). Items & Description combo, Amount column, Tax dropdown, "+ Add Line Item" below the list. Same dynamic-field substitution on item pick. Same totals strip below (informational on the template; what shows on each generated invoice is recomputed at run time).
- Card 4: Footer (Payment Details / Internal Notes / Terms) — identical to invoice form. Payment Details auto-populates from billing company on customer change; same default Terms prefill.

### 3.3 Save validation

The Save button is **disabled** until all of:

- `customerId` is set, AND
- `recurringScheduleId` is set, AND
- `startDate` is set, AND
- at least one line item has a non-empty `description`.

`canSave = boolean(...)` drives `disabled={!canSave || saving}` on the submit button. Backend DTO enforces the same with `@IsNotEmpty()` / `@ArrayNotEmpty()` validators as defense-in-depth. This rule applies to the **recurring** form only — the invoice form keeps its current always-clickable Save + HTML5 validation behavior.

### 3.4 Customer-required gate on line items

While `customerId` is empty:

- Amber banner above the line items table: *"Select a customer to add line items."*
- All line input controls (description, amount, tax dropdown, delete button) `disabled`.
- "+ Add Line Item" button `disabled`.

Identical mechanism to the invoice form's existing gate.

### 3.5 Settings page — `/settings/recurring-schedules`

Tax-Types-style manager:
- List table with edit/delete actions.
- Dialog to create/edit. Fields: Name · Interval Unit (DAYS / WEEKS / MONTHS / YEARS) · Interval Count (number ≥ 1) · Active (switch).
- Default sort: Active first, then Name asc.

### 3.6 Implementation note — shared body editor

`InvoiceForm` (the existing invoice edit form) and the new `RecurringForm` share Cards 2–4 via a new extracted child component **`<InvoiceBodyEditor>`** located at `frontend/components/invoices/invoice-body-editor.tsx`. The child owns:

- Customer / billing-company "From" block (left column).
- Line items card (with item picker, tax dropdown, customer-required gate).
- Payment Details / Internal Notes / Terms footer card.

Props include the shared form state (customers, items, taxTypes lists + line state + payment-details state + setters). Both parent forms render `<InvoiceBodyEditor>` plus their own card(s):

- `InvoiceForm` renders the right-column metadata card (Invoice Number / Invoice Date / Due Date / PO Number / Status badge).
- `RecurringForm` renders the "Recurring Settings" card at the top, with PO Number folded in.

This is **load-bearing** for the future email/PDF templates feature: pipeline upgrades (e.g. swapping the hardcoded email body for templated rendering) flow through `MailService.sendInvoice`, which both manual `POST /invoices/:id/send` and recurring `SEND_DIRECTLY` already route through. Shared body editor → shared mail pipeline → one place to change, two consumers benefit.

## 4. Generation processor

The existing BullMQ `recurring-invoices` queue (1-minute repeat pattern, tz from `Preferences.timezone`) stays. Replace the contents of `recurring.processor.ts`.

### 4.1 Sweep loop

```
For every rule where active = true AND nextRunAt <= now (joining customer,
customer.billingCompany, recurringSchedule, lineItems):
  if any skip condition holds → log warning, skip rule
  else                        → generate one invoice + advance nextRunAt

One invoice per rule per sweep — never bulk-generate catch-up runs in a single
tick. A multi-day outage clears within minutes of restart, bounded.
```

### 4.2 Per-invoice generation

1. **Resolve dates** using the configured tz:
   - `invoiceDate` = start-of-day today (local-calendar correct for users east of UTC).
   - `dueDate` = `invoiceDate + paymentTermsOffset(customer.paymentTerms)` — same `IN_28_DAYS → +27`, `IN_15_DAYS → +14`, `IN_7_DAYS → +6`, `DUE_ON_RECEIPT → +0` table used by the invoice form. The helper currently lives in `frontend/components/invoices/invoice-form.tsx` as `paymentTermsToOffsetDays`; the backend will get its own copy in a shared util (e.g. `backend/src/common/payment-terms.ts`) and the frontend should import from the same source-of-truth string table if reasonable.
2. **Apply dynamic fields** to every line description: `applyDynamicFields(desc, { invoiceDate, dueDate })`. The substitution is one-shot at generation time and frozen into the resulting `InvoiceItem.description`.
3. **Compute totals** (`subtotal`, `taxAmount`, `totalAmount`) using a backend util shared with `InvoicesService.create`. The two computation sites must not drift.
4. **Insert the Invoice** in a single transaction:
   - `status = DRAFT` (always — even for `SEND_DIRECTLY`; SENT is only set when the send actually succeeds).
   - `invoiceNumber = MAX(invoiceNumber) + 1`.
   - `customerId`, `billingCompanyId`, `poNumber`, `paymentDetails`, `internalNotes`, `terms` copied from rule.
   - `recurringRuleId = rule.id`.
   - `lineItems` = rule's lineItems with resolved descriptions, `quantity = 1`, `unitPrice = ruleLine.unitPrice`, tax snapshot copied across, `lineAmount` / `taxAmount` computed.
5. **If `sendingOption === SEND_DIRECTLY`** → call `InvoiceMailService.send(invoice.id)`. That entry point owns:
   - The synchronous first SMTP attempt.
   - The BullMQ `invoice-mail` queue for the 3 retries (10-min fixed backoff each, 4 attempts total).
   - The eventual `status = FAILED_TO_SEND` flip on final failure.
   - The Telegram broadcast + Resend email to `billingCompany.accountsEmail` on final failure.
   No code duplication between the recurring sweep and the manual "Send Invoice" button.
6. **Advance `nextRunAt`** by `intervalCount × intervalUnit`:
   - `DAYS` / `WEEKS` → plain millisecond arithmetic.
   - `MONTHS` / `YEARS` → calendar math with day-of-month clamping (Jan 31 + 1 month → Feb 28/29).
   The advance happens whether step 5 succeeded, failed, or wasn't attempted — a failed send doesn't reschedule a duplicate generation.

### 4.3 Skip conditions

A rule is silently un-generable (logged, `nextRunAt` left alone) if any of:

- `customerId` is null. Rule #1 (customer-delete protection — see §6.3) makes this much harder to reach, but the guard remains as defense-in-depth.
- `customer.billingCompany` is null.
- `recurringScheduleId` is null (schedule was deleted via Settings).
- `lineItems.length === 0`.

The user re-points the rule (or deletes it) and the next sweep picks it up.

### 4.4 Two paths through one pipeline

| Sending option | What the sweep does | What the user sees |
|---|---|---|
| `REVIEW_BEFORE_SENDING` | Generates Invoice with `status = DRAFT`. Done. | Invoice appears in the list. User opens it, reviews, clicks Send Invoice → routes through `InvoiceMailService.send`. |
| `SEND_DIRECTLY` | Generates Invoice with `status = DRAFT`. Immediately calls `InvoiceMailService.send`. | If SMTP succeeds → status flips to SENT. If all 4 attempts fail → status flips to FAILED_TO_SEND, Telegram + Resend notifications fire. |

Both paths converge on the same mailing pipeline. **This is the reason there's nothing else to design.**

## 5. SMTP routing (no spec changes — leveraging existing)

`MailService.resolveConfigForInvoice(invoiceId)` resolves the outbound SMTP config:

- If `customer.billingCompany.sendVia === CUSTOM_SMTP` and the company's five custom-SMTP fields are populated → use the company's credentials.
- Otherwise → fall back to the singleton `MailConfiguration` row.
- If neither is configured → throw "No SMTP configured" so the user sees a clear error.

This routing is **shared by manual `POST /invoices/:id/send` and the recurring `SEND_DIRECTLY` path**. A future "every generated invoice goes through Resend instead of SMTP" change would land here once and apply to both.

## 6. Migration, seed, data integrity

### 6.1 Schema migration is non-additive

`RecurringRule` is being replaced wholesale — old columns dropped, new columns required. The backend's boot sequence runs `prisma db push --accept-data-loss`, which can't coerce existing rule rows into the new shape (no source values for the new required fields like `scheduleId`, `startDate`, `sendingOption`).

**Operational impact:** the first boot after pulling this change will fail the push.

**Recovery:** one-time `docker compose down -v` to wipe Postgres + Redis volumes. The seed repopulates demo data including the new tables.

**Documentation:** `Architecture.md`'s "Known operational caveats" gains an entry covering this.

### 6.2 Seed additions

- **`RecurringSchedule` rows:** *Every week*, *Every 2 weeks*, *Every 4 weeks*, *Every month*, *Every quarter*, *Every year*. Six rows; all active.
- **One sample `RecurringRule`** linked to a seeded customer:
  - `startDate = today + 1 day`
  - `recurringSchedule = "Every month"`
  - `sendingOption = REVIEW_BEFORE_SENDING`
  - One line item: `description = "Monthly retainer for {{month-year}}"`, `unitPrice = 1000`, tax = GST 10%.
  Gives a fresh-install `/recurring` list something meaningful to display.

### 6.3 Customer-delete protection (rule #1 — already shipped, formalized here)

- **Backend:** `CustomersService.remove(id)` counts referencing `Invoice` + `RecurringRule` rows and throws `ConflictException` with `"Cannot delete customer: <N> invoice(s) and <M> recurring invoice(s) reference this customer. Remove or reassign them first."` when either is non-zero.
- **Frontend:** Customer edit page's `remove()` catches the 409 via `parseError` and surfaces it inline (existing rose-600 error display).
- **Already shipped this turn** but listed here so the recurring feature's data-integrity story is documented in one place.

### 6.4 Documentation updates after implementation

Per project convention, the four sibling docs are audited; whoever touches the feature updates them.

| Doc | Updates |
|---|---|
| `modules_and_logic.md` | Replace the existing "Recurring Invoices" section's "Edit page: Not yet built" note with the full §3.2 layout. Document the Save-validation rules from §3.3. Cross-reference the Dynamic Fields page. Add the `/settings/recurring-schedules` subsection alongside Tax Types. |
| `DatabaseSchema.md` | Replace the existing `RecurringRule` row entirely with the new shape. Add `RecurringSchedule` and `RecurringRuleLineItem` rows. Document `InvoiceStatus.FAILED_TO_SEND` + the `sendError` / `sendAttempts` / `lastSendAt` columns already added this turn. Add `RecurringIntervalUnit` and `SendingOption` enums; remove `RecurringFrequency`. |
| `Architecture.md` | Add the `invoice-mail` BullMQ queue alongside the existing `recurring-invoices` sweep. Document the `RESEND_API_KEY` and `RESEND_FROM` env vars. Add the non-additive RecurringRule replacement to "Known operational caveats". |
| `DesignSystem.md` | Add `FAILED_TO_SEND` to the Badge color table (reuses the existing `overdue` rose tone). |

## 7. Explicit out-of-scope items

- **Email/PDF rotating templates.** Will be a separate spec. Won't reopen anything in this one — the body editor extraction and shared mail pipeline are set up so templates drop onto the existing `MailService.sendInvoice` callsite.
- **Per-attempt error history.** Only the most recent SMTP error is stored on `Invoice.sendError`. Sufficient for the failure-notification body.
- **"Retry now" action on `FAILED_TO_SEND` invoices.** Once an invoice flips to FAILED_TO_SEND the user re-clicks "Send Invoice" manually to retry. Re-using the existing button is enough — no new affordance.
- **In-app notification center.** Telegram + Resend cover the spec.

## 8. Acceptance criteria

This spec is satisfied when:

1. The schema changes in §2 are applied. `docker compose down -v` once + boot succeeds + seed populates the new tables.
2. `/settings/recurring-schedules` lists the seeded schedules and supports CRUD via the tax-types-manager pattern.
3. `/recurring` shows the seeded recurring rule with the columns and default sort from §3.1.
4. `/recurring/new` and `/recurring/[id]` render the four-card layout from §3.2, with the customer-required gate and Save-validation rules from §3.3 / §3.4 enforced.
5. Editing the seeded recurring rule, clicking Save, then waiting until `nextRunAt <= now` causes an Invoice to appear in `/invoices` with:
   - Status `DRAFT` (for `REVIEW_BEFORE_SENDING`) or `SENT` / `FAILED_TO_SEND` for `SEND_DIRECTLY` depending on SMTP outcome.
   - Resolved `{{month-year}}` etc. in the line description.
   - `subtotal` / `taxAmount` / `totalAmount` computed.
   - `recurringRuleId` back-pointer set.
6. The four sibling docs in §6.4 are updated.
