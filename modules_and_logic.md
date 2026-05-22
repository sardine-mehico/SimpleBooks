# modules_and_logic.md

Reference for every module currently in SimpleBooks: data model, list page, edit page, and the non-obvious business logic.

For shared UI patterns (lists, forms, filters, sort, pagination, colors, typography) see `DesignSystem.md`. This doc covers the per-module *what* and *why*.

Conventions used here:
- "**yes**" in the Required column = enforced by the DTO and the form.
- "auto" = set by the service or database, not by the user.
- List/edit pages live under the route shown; both inherit the global layout (sidebar + command bar) automatically.

---

## Billing Companies

Operating entities that issue invoices. Backend module: `companies`. Route prefix: `/companies`.

### Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | auto | |
| `name` | string | **yes** | UI label: "Company Name" |
| `abn` | string | **yes** | UI placeholder text: "Australian Business Number" |
| `address` | text (multi-line) | **yes** | Newlines preserved on invoices. 3-line textarea on edit page. |
| `accountsEmail` | email | **yes** | UI label: "Accounts Email (from)" |
| `invoiceBcc` | email | **yes** | UI label: "Invoice Backup Email (BCC)" — receives a copy of every outgoing invoice email |
| `paymentDetails` | rich text (sanitized HTML) | **yes** | Bold / Italic / Underline toolbar; line breaks preserved on invoices |
| `notes` | text | no | 6-line textarea; admin-only memo |
| `isActive` | boolean | no | When toggled off, `deactivatedAt` auto-stamps |
| `createdAt` | datetime | auto | |
| `updatedAt` | datetime | auto | UI label: "Last edited at" |
| `deactivatedAt` | datetime | auto | Set on `isActive` true → false; cleared when re-activated |
| `creationOrder` | int | auto | 1-based ordinal assigned atomically at create. Drives the rotation rule — see Logic. |
| `invoiceTemplateId` | FK → InvoiceTemplate | auto | Assigned once at create via the rotation rule; immutable thereafter. |
| `emailTemplateId` | FK → EmailTemplate | auto | Assigned once at create via the rotation rule; immutable thereafter. |

### List page — `/companies`
- **Columns:** Company Name · ABN · Accounts Email · Address (first line of multi-line) · Status
- **Search & filter:** Company Name (text) · ABN (text) · Address (text) · Status (select: Active / Inactive)
- **Default sort:** Status asc (Active first), tie-breaker Company Name asc.

### Edit page — `/companies/[id]` (and `/companies/new`)
- **Row 1:** Company Name (required) · ABN (required)
- **Row 2:** Accounts Email (from) (required) · Invoice Backup Email (BCC) (required)
- **Row 3:** Address (required, 3-line textarea) · Active (switch)
- **Row 4:** Payment Details (required, rich-text editor with B/I/U, 4 lines) · Notes (6-line textarea)
- **Audit footer:** `Created at`, `Last edited at`, `Deactivated at` displayed read-only in `dd/mm/yyyy HH:MM AM/PM`. Left-aligned, label + value.

### Logic
- Address & Payment Details render as a read-only "From — [Company]" panel on the invoice edit page when this company is selected for an invoice.
- Hard delete is allowed from the edit page (Delete button bottom-left).
- **Template rotation (set once at create, permanent thereafter):** `CompaniesService.create` wraps everything in a transaction. `creationOrder = max(creationOrder) + 1` (1-based). `displayOrder = ((creationOrder - 1) % N) + 1` for each of `InvoiceTemplate` and `EmailTemplate` independently — N is the count of that template type. Company 1 → both displayOrder 1. Company 11 → both displayOrder 1 again (wraparound). The assignment is **never edited or deleted** through UI. FK is `Restrict`, so a referenced template can't be removed. There is no UI on the company form to view or change these — the catalogue is invisible by design.

---

## Customers

Entities that receive invoices. Backend module: `customers`. Route prefix: `/customers`.

### Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | auto | |
| `customerNumber` | int | auto | `MAX + 1`, starts at 1001. Not editable. |
| `name` | string | **yes** | UI label: "Customer Name" |
| `billingEmail1` | email | **yes** | UI label: "Primary billing email" (DB column kept as `billingEmail1`) |
| `billingEmail2` | email | no | UI label: "Secondary billing email" |
| `billingCompanyId` | FK → BillingCompany | **yes** | The entity that bills this customer |
| `paymentTerms` | enum | **yes** | UI label: "Payment Due In". Values: `IN_28_DAYS` (default) / `IN_15_DAYS` / `IN_7_DAYS` / `DUE_ON_RECEIPT` |
| `address` | text (multi-line) | **yes** | 3-line textarea on edit form, newlines preserved on invoices |
| `notes` | text | no | 6-line textarea |
| `isActive` | boolean | no | |
| `createdAt` / `updatedAt` | datetime | auto | |

### List page — `/customers`
- **Columns:** # (customerNumber) · Customer Name · Billing Co. · Address · Primary billing email · Status
- **Search & filter:** Customer Name (text) · Email (text) · Billing Company (select — populated from `/companies`) · Status (select: Active / Inactive)
- **Default sort:** Status asc, tie-breaker Customer Name asc.

### Edit page — `/customers/[id]` (and `/customers/new`)
- **Row 1:** Customer Number (read-only on edit; hidden on create) · Customer Name (required)
- **Row 2:** Primary billing email (required) · Secondary billing email
- **Row 3:** Billing Company (required, select) · Payment Due In (required, select; defaults to 28 Days)
- **Row 4:** Address (required, 3-line textarea) · Active (switch)
- **Row 5:** Notes (6-line textarea, full width)

### Logic
- Customer Number is auto-generated server-side (`MAX(customerNumber) + 1`, seed minimum 1001).
- Payment Due In defaults to **IN_28_DAYS** for new customers.
- Form has a client-side check that Billing Company is selected before submit; backend enforces it via DTO.

---

## Items

Catalog of line-item products / services usable on invoices. Backend module: `items`. Route prefix: `/items`.

### Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | auto | |
| `name` | string | **yes** | |
| `unitPrice` | decimal(12,2) | **yes** | |
| `description` | text | no | |
| `isActive` | boolean | no | |
| `createdAt` / `updatedAt` | datetime | auto | |

### List page — `/items`
- **Columns:** Name · Description · Unit Price · Status
- **Search & filter:** Name (text) · Description (text) · Status (select: Active / Inactive)
- **Default sort:** Status asc, tie-breaker Name asc.

### Edit page — `/items/[id]` (and `/items/new`)
- **Row 1:** Name (required, full width)
- **Row 2:** Unit Price (required, number) · Active (switch)
- **Row 3:** Description (textarea, full width)

### Logic
- When an item is selected on an invoice line, its name + unit price prefill the line's description and unit price (one-time, user can still edit the line).

---

## Invoices

The primary financial document. Backend module: `invoices`. Route prefix: `/invoices`.

### Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | auto | |
| `invoiceNumber` | int | auto | `MAX + 1`, starts at 1000 |
| `invoiceDate` | datetime | yes | |
| `dueDate` | datetime | no | |
| `customerId` | FK → Customer | no | |
| `billingCompanyId` | FK → BillingCompany | no | |
| `status` | enum | yes | `DRAFT` / `SENT` / `VIEWED` / `PARTIAL_PAID` / `PAID` / `VOID` (rendered as **VOIDED**) / `FAILED_TO_SEND` |
| `subtotal` | decimal(12,2) | computed | Sum of `lineItems.lineAmount` |
| `taxAmount` | decimal(12,2) | computed | Sum of `lineItems.taxAmount` |
| `totalAmount` | decimal(12,2) | computed | `subtotal + taxAmount` |
| `poNumber` | string | no | |
| `paymentDetails` | rich text (sanitized HTML) | no | Same B/I/U editor as Billing Company. 4-line editor. |
| `internalNotes` | text | no | Not shown to customer |
| `terms` | text | no | |
| `lineItems` | array → InvoiceItem | ≥1 | Inline on the edit form |
| `recurringRuleId` | FK → RecurringRule | no | Set when this invoice was generated by a recurring rule |
| `invoiceTemplateId` | FK → InvoiceTemplate | auto | Snapshotted from `billingCompany.invoiceTemplateId` at create. Used by `GET /invoices/:id/pdf`. |
| `emailTemplateId` | FK → EmailTemplate | auto | Snapshotted from `billingCompany.emailTemplateId` at create. Used by `POST /invoices/:id/send` + `GET /invoices/:id/send-context`. |
| `createdAt` / `updatedAt` | datetime | auto | |

### Line items (`InvoiceItem`)
| Field | Type | Required | Notes |
|---|---|---|---|
| `itemId` | FK → Item | no | Optional — picking from the item-picker dropdown prefills `description` + the line's Amount |
| `description` | string | yes | |
| `quantity` | decimal(12,2) | yes | **Hidden from the UI** — the form always writes `1` and puts the user-entered Amount into `unitPrice`. The column stays on the model so existing data round-trips. |
| `unitPrice` | decimal(12,2) | yes | The line's "Amount" from the UI. |
| `lineAmount` | decimal(12,2) | computed | `quantity * unitPrice` (= Amount when written from the UI) |
| `taxTypeId` | string | no | FK-style id from `/tax-types`. Set by the Tax dropdown; the backend stores it on the line. |
| `taxName` | string | no | Snapshot of the selected `TaxType.name` at save time (e.g. "GST"). |
| `taxRate` | decimal(6,3) | no | Snapshot of the selected `TaxType.rate`. Percent, 0–100. |
| `taxAmount` | decimal(12,2) | computed | `lineAmount * taxRate / 100` |
| `position` | int | auto | Source order within the invoice |

### List page — `/invoices`
- **Columns (in this order, all sortable):** Invoice No (`INV-####`) · Invoice Date · Customer · Billing Company · Amount (right-aligned currency) · Due Date · Status.
- **Search & filter:** Invoice No (text) · Customer (text) · Billing Company (select — options come from `/companies`) · Date from (date) · Date to (date) · Status (select with all 6 enum values).
- **Date range filter** compares against `invoiceDate`, inclusive: from `00:00:00` of "Date from" through `23:59:59.999` of "Date to". Either bound is optional.
- **Default sort:** Invoice No desc (newest invoices first).

### Edit page — `/invoices/[id]` (and `/invoices/new`)
- **Header card** — single 2-column grid (`grid-cols-[1fr_360px]` at `md+`). Was previously two stacked cards; merged so the form opens with the customer block and the invoice metadata side-by-side.
  - **Left column** (read-only "From" + Customer block):
    - Linked Billing Company display block: Company Name (bold) · `ABN: <abn>` · multi-line Address · `E: <accountsEmail>`. Populated from the selected Customer's `billingCompany` relation. If no customer is selected, shows a muted "Select a customer to populate billing company details" hint.
    - Customer (select, capped at 320px max width) — choosing one auto-fills the entire block above.
    - Customer address rendered below the Customer select (newlines preserved).
  - **Right column** (label-left rows; right cell fixed at 160px so inputs share a right-aligned column):
    - Status — **read-only badge** pinned to the top right of the column (tone matches the list page). The invoice status is set by lifecycle events elsewhere, not from this form.
    - Invoice Number (read-only, "Auto-generated" on create)
    - Invoice Date (required) — defaults to **today**
    - Due Date — auto-recomputed on customer / invoice-date change (see Logic)
    - PO Number
- **Line Items card:**
  - Three visible columns: **Items & Description** · **Amount** (right-aligned currency, `$` adornment) · **Tax** · delete.
  - **Items & Description** is a single field — a free-text Input with a trailing chevron that opens a `DropdownMenu` listing the catalogue of `Item`s (name + unit price). Picking an item populates both the description and the line's Amount (one-shot — the user can still edit either afterwards). The description is sourced from the `Item.description` field (falling back to `Item.name` if blank) and run through [Dynamic Fields](#dynamic-fields--settingsdynamic-fields-display-only) substitution at pick time, so `{{invoice date}}` / `{{due date}}` / `{{month-year}}` resolve against the host invoice.
  - **Customer required to add lines.** Until the user picks a Customer, every line input is disabled, the "+ Add Line Item" button is greyed out, and an amber banner reads *"Select a customer to add line items."*
  - **Amount** is per-line currency; on save it's serialised as `quantity = 1, unitPrice = amount` so the backend's `lineAmount = quantity * unitPrice` matches what the user typed. Existing invoices with `quantity != 1` collapse to a single Amount on first load (Amount = lineAmount).
  - **Tax** is a `Select` whose options are the active rows from `/tax-types` (label `"<name> <rate>%"`, e.g. `GST 10%`, `VAT 20%`). Selecting an option writes `taxTypeId`, `taxName`, `taxRate` onto the line so the backend stores all three.
  - **"+ Add Line Item"** sits **below** the line list (indigo ghost button), not in the card header.
  - **Totals box** (right-aligned): Subtotal · `<taxLabel>` · `Total (incl. <taxLabel>)`. `taxLabel` is derived live:
    - All non-empty lines share one tax name → use it (`GST`, `VAT`, etc).
    - Mixed tax names → `TAX`.
    - No tax names → `Tax`.
- **Footer card** (2-column grid):
  - Payment Details (rich-text editor, B/I/U). On every user-driven customer change, this field is **reset** to the newly-selected billing company's `paymentDetails` — any prior content (including manual edits or the previous customer's auto-fill) is discarded. Clearing the customer empties the field. The first render of an existing invoice is skipped so a saved value is never clobbered.
  - Internal Notes (textarea, not shown to customer)
  - Terms (textarea, full width below). On a **new** invoice this prefills with the standard wording: *"Please reference invoice number when making payment. A $25 search fee applies if the funds cannot be properly allocated to your account."* Existing invoices keep whatever was saved.

### Logic
- All money/tax fields recompute on every save; user cannot type them directly.
- Invoice update replaces the entire `lineItems` collection inside a transaction (delete-all + create-all). Simpler than diffing.
- **Billing Company is derived from the selected Customer** — there is no separate Billing Company select on the form. `billingCompanyId` is still saved to the invoice (taken from `customer.billingCompany.id`).
- **Due Date auto-compute:** whenever the user changes the Customer or the Invoice Date, the Due Date is set to `invoiceDate + (paymentTerms − 1 day)`:
  - `IN_28_DAYS` → +27 days
  - `IN_15_DAYS` → +14 days
  - `IN_7_DAYS` → +6 days
  - `DUE_ON_RECEIPT` → same day as invoice date
  - On initial load of an existing invoice the saved Due Date is preserved (the auto-compute skips its first render). Manual edits to Due Date are kept until the user next changes Customer or Invoice Date.
- **Default Terms** prefill on `/invoices/new`. Existing invoices keep their saved value.

### Page chrome — Back / Cancel / Edit / Save / hamburger
The invoice edit page (and every other edit page) uses [EditPageChrome](frontend/components/layout/edit-page-chrome.tsx). Top row:

```
[← Back]  Invoice · INV-####                 [Cancel] [Edit?] [Save] [☰]
```

- **Back** navigates to `/invoices`.
- **Cancel** behaves the same as Back.
- **Edit** appears only when the invoice opens in **view mode** (existing invoices do; see below). Clicking it unlocks the form.
- **Save** submits the wrapped `<form>` via the HTML5 `form="invoice-form"` attr. Disabled while `saving` or `viewMode` is `true`.
- **Menu** button (`lucide-react` `Menu` icon followed by the literal text "Menu") opens a Radix `DropdownMenu` with all per-invoice actions:
  - **Clone** — `POST /invoices/:id/clone`. Duplicates header + line items into a new `DRAFT`. Fresh `invoiceNumber` (MAX + 1); `invoiceDate` resets to today; `dueDate` cleared (the form's payment-terms effect recomputes it on open). Send-tracking columns (`sendAttempts`, `sendError`, `lastSendAt`) are not copied. Navigates to the clone's edit page.
  - **PDF** — opens `GET /invoices/:id/pdf` in a new tab (`Content-Disposition: inline`). Rendered by `@react-pdf/renderer` against the snapshotted `invoiceTemplateId` (registry at [backend/src/pdf/templates/index.ts](backend/src/pdf/templates/index.ts)); unknown / unmapped keys fall back to `default.tsx`.
  - **Send** — opens the Send Invoice dialog (see below). Available on every status **except** `VOID` (so SENT / VIEWED / PARTIAL_PAID / PAID invoices can be resent if the customer asks for another copy or the first delivery bounced).
  - **Void** — opens the **Void** confirmation modal which requires the operator to type a free-text **Reason to void**. On submit, `POST /invoices/:id/void` with `{ reason }` flips `status` to `VOID` and persists `voidReason` + `voidedAt` on the invoice for the audit trail. Hidden when already `VOID`.
  - **Delete** — opens the **Delete** confirmation modal which requires a free-text **Reason to delete**. On submit, `DELETE /invoices/:id` with `{ reason }` deletes the row; since the row goes away, the reason is written to the backend log (`Invoice deleted: INV-#### (id=…) — reason: …`) for traceability. Rose-tinted, separated by a thin divider from the rest of the menu.

### View mode (existing invoices)
Existing invoices open with `viewMode = true`: form fields are wrapped in `<fieldset disabled>` (locks every native input + Radix select), and `RichTextEditor` receives `disabled` so its contenteditable div is locked too. The Save button is disabled. An **Edit** button sits to the left of Save; clicking it flips `viewMode = false`, unlocking everything. New invoices skip view mode entirely (`viewMode = false` from open).

### Send Invoice dialog
- On open, `GET /invoices/:id/send-context` returns From / To / CC / BCC / Subject / HTML already token-substituted against the snapshotted `EmailTemplate`. The dialog pre-fills these. The endpoint also lazily mints the invoice's `publicToken` if missing so the rendered body shows the real customer-facing URL (rather than the `{{invoice link}}` placeholder).
- **Editable fields:** From, To, CC, BCC, Subject, and the **Attach PDF invoice** checkbox. CC pre-fills from the customer's secondary billing email (`Customer.billingEmail2`); BCC pre-fills from the billing company's `Invoice Backup Email (BCC)` (`BillingCompany.invoiceBcc`). Both are editable from there.
- **Body is read-only.** The HTML body is rendered into the dialog as a non-editable preview block — the customer-facing email copy lives in the seeded `EmailTemplate`, not per-send. To change the copy, update the seeded template (see [Invoice & Email Templates](#invoice--email-templates--no-ui-surface)).
- **Attach PDF invoice** checkbox sits below the body preview. Off by default — the standard flow delivers the invoice via the public link only. When ticked the rendered PDF is also attached to the outgoing email.
- **No separate preview step.** Clicking **Email Invoice** dispatches immediately — what you see in the dialog is what the customer gets (HTML body + optional PDF attachment).
- `POST /invoices/:id/send` accepts an optional body: `{ from, to, cc, bcc, subject, html, attachPdf }`. Any omitted field falls back to the assigned template/routing on the server. Override values (including `attachPdf`) are forwarded into BullMQ retry jobs so each retry attempt re-uses the customer-facing email the user dispatched.
- **No plain-text alternative.** Outgoing customer emails are HTML-only; clients with HTML rendering disabled will see the raw markup. This is a deliberate boilerplate trade-off — every shipped template assumes a modern HTML-capable mail client.

### Public invoice view (`/i/:token`)
- Customer-facing read-only HTML render of the invoice, reached via the link injected into the outgoing email by `{{invoice link button}}` / `{{invoice link}}`. Lives at `frontend/app/i/[token]/page.tsx`; bypasses the standard sidebar/command-bar chrome (the `AppShell` wrapper at `frontend/components/layout/app-shell.tsx` strips chrome for any path under `/i/`). Renders bare on a `#EDEEF3` background with a sticky "Download PDF" action.
- **Token model:** 32-byte URL-safe random string (`crypto.randomBytes(32).toString('base64url')`, ~43 chars) stored on `Invoice.publicToken` with `@unique`. Minted lazily the first time the invoice is sent (also pre-warmed by `/send-context`). Never expires, never rotated — customers can re-open the same link months later.
- **Backend endpoints** ([backend/src/public-invoices/](backend/src/public-invoices/), unauthenticated):
  - `GET /public/invoices/:token` returns a slimmed-down DTO (no internal notes, no send-error history, no email template).
  - `GET /public/invoices/:token/pdf` streams the existing `PdfService.renderInvoice` output with `Content-Disposition: attachment` so the browser saves `INV-####.pdf` to Downloads.
- **VIEWED transition:** the first GET to `/public/invoices/:token` for a `SENT` invoice flips status to `VIEWED` and stamps `viewedAt` in a single update. Guarded on `status === 'SENT'` only — `PARTIAL_PAID` / `PAID` are never downgraded by a later open. Idempotent (subsequent opens don't re-stamp).
- **404 semantics:** unknown token, `DRAFT`, `VOID`, and `FAILED_TO_SEND` all return the same `NotFoundException`. This keeps the row's existence invisible to anyone guessing — the public page never confirms "this invoice exists but you can't see it".
- **Per-design renders:** the page resolves a palette from the snapshotted `invoiceTemplate.templateKey` via [`getPalette`](frontend/components/public-invoice/palettes.ts) and feeds it into a single shared layout component, [`<PalettedInvoice>`](frontend/components/public-invoice/paletted-invoice.tsx). One layout, ten palettes — one per `design-1` … `design-10`, each mirroring the matching PDF template's page-tint + accent colour + font. Aesthetic parity (palette + font), not pixel parity, is the goal. Unknown keys fall back to `DEFAULT_PALETTE` (neutral grey, Inter). The "Download PDF" button is tinted with the palette's `brand` colour so it matches the rest of the page.

### VOID semantics
- `VOID` invoices remain in the database and appear in the Invoices list with the **VOIDED** badge so the audit trail is preserved.
- Dashboard aggregates exclude `VOID` by construction: `totalRevenue` sums only `PAID`; `receivable` sums only `SENT` / `VIEWED` / `PARTIAL_PAID`; the monthly revenue strip uses `PAID`. No special-case filtering needed — `VOID` simply doesn't match any aggregate predicate ([backend/src/dashboard/dashboard.service.ts](backend/src/dashboard/dashboard.service.ts)).

---

## Recurring Invoices

First-class invoice templates that auto-generate Invoices on a cron. Backend module: `recurring`. Route prefix: `/recurring`. Shares Cards 2–4 of the edit page with the invoice form via the extracted `<InvoiceBodyEditor>` child (`frontend/components/invoices/invoice-body-editor.tsx`).

### Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | auto | |
| `scheduleName` | string | auto | Derived as `"<customer> - <schedule.name>"` and stored at save. Read-only in the UI; re-derives whenever customer or recurring-schedule changes before save. |
| `startDate` | datetime | **yes** | User-picked. First generation runs on/after this date. |
| `recurringScheduleId` | FK → RecurringSchedule | **yes** | From the `/settings/recurring-schedules` catalog. |
| `sendingOption` | enum | **yes** | `REVIEW_BEFORE_SENDING` (default) / `SEND_DIRECTLY` |
| `active` | boolean | no | Default `true`. Sweep ignores inactive rules. |
| `nextRunAt` | datetime | auto | Set to `startDate` at create; advanced by `intervalCount × intervalUnit` after each generation. |
| `customerId` | FK → Customer | **yes** | Save is disabled until set. |
| `billingCompanyId` | FK → BillingCompany | auto | Derived from `customer.billingCompany` at save. |
| `poNumber` | string | no | Template default; copied onto every generated invoice. |
| `paymentDetails` | rich text (sanitized HTML) | no | Auto-populates from billing company on customer change (same behaviour as the invoice form). |
| `internalNotes` | text | no | |
| `terms` | text | no | |
| `lineItems` | array → RecurringRuleLineItem | ≥1 | Inline on the edit form. |
| `createdAt` / `updatedAt` | datetime | auto | |

### Line items (`RecurringRuleLineItem`)
Mirrors `InvoiceItem`'s shape but without computed totals — totals are computed fresh on every generation.
| Field | Type | Required | Notes |
|---|---|---|---|
| `itemId` | FK → Item | no | Optional; same item-picker chevron UX as the invoice form. |
| `description` | string | yes | May contain `{{month-year}}` / `{{invoice date}}` / `{{due date}}` — resolved at generation time. |
| `unitPrice` | decimal(12,2) | yes | The "Amount" column. Quantity is never surfaced — always written as `1` at generation. |
| `taxTypeId` | string | no | |
| `taxName` | string | no | Snapshot of `TaxType.name` at save. |
| `taxRate` | decimal(6,3) | no | Snapshot of `TaxType.rate`. |
| `position` | int | auto | Source order. |

### List page — `/recurring`
- **Columns:** Schedule Name · Customer · Recurring Schedule · Next Run · Amount (sum of line item `unitPrice`, client-computed) · Sending Option · Active.
- **Search & filter:** Schedule Name (text) · Customer (text) · Recurring Schedule (select) · Sending Option (select) · Active (select).
- **Default sort:** Active first, tie-breaker Schedule Name asc.
- **Action bar:** Filter button · "+ New recurring invoice" button.

### Edit page — `/recurring/[id]` (and `/recurring/new`)
Four cards, top to bottom. Card 1 is recurring-specific; Cards 2–4 are rendered by `<InvoiceBodyEditor>`, shared with the invoice form.

- **Card 1 — Recurring Settings:**
  - Row 1: **Schedule Name** — read-only display, auto-filled `<customer> - <schedule.name>`. Empty until both are picked.
  - Row 2: **Start Date** (date, required) · **Recurring Schedule** (select from `/recurring-schedules` active rows, required)
  - Row 3: **Sending Options** (select: *Review before sending* / *Send directly to client*) · **Active** (switch)
  - Row 4: **PO Number** (text — moved here from the invoice-form right column; flows to every generated invoice as a template default)
- **Card 2 — Customer & Billing Company:** mirror of the invoice form's "From" card. The right column (Invoice Number / Invoice Date / Due Date / Status) is removed entirely — those belong on generated invoices, not the template.
- **Card 3 — Line Items:** Items & Description combo, Amount column, Tax dropdown, "+ Add Line Item" below the list. Same [Dynamic Fields](#dynamic-fields--settingsdynamic-fields-display-only) substitution on item pick. Totals strip below is informational on the template — totals on each generated invoice are recomputed at run time.
- **Card 4 — Footer:** Payment Details (rich-text B/I/U, auto-populates from billing company on customer change) · Internal Notes · Terms (full-width; new rules prefill the standard wording).

### Save validation
The Save button is **disabled** until **all** of:
- `customerId` is set, AND
- `recurringScheduleId` is set, AND
- `startDate` is set, AND
- at least one line item has a non-empty `description`.

Backend DTO enforces the same with `@IsNotEmpty()` / `@ArrayNotEmpty()` as defense-in-depth. This Save-button-disabled rule is recurring-specific — the invoice form keeps its always-clickable Save behaviour.

### Customer-required gate on line items
While `customerId` is empty:
- Amber banner above the line items table: *"Select a customer to add line items."*
- All line input controls (description, amount, tax dropdown, delete button) `disabled`.
- "+ Add Line Item" button `disabled`.

Identical mechanism to the invoice form's gate.

### Logic
- BullMQ `recurring-invoices` queue with a repeat pattern of `* * * * *` (every minute). Timezone comes from `Preferences.timezone`.
- On each sweep the processor loads rules where `active = true AND nextRunAt <= now` (joining customer, customer.billingCompany, recurringSchedule, lineItems). One invoice per rule per sweep — no bulk catch-up.
- For each rule:
  1. **Resolves dates** using the configured tz: `invoiceDate` = start-of-day today; `dueDate` = `invoiceDate + paymentTermsOffset(customer.paymentTerms)` using the same `IN_28_DAYS → +27`, `IN_15_DAYS → +14`, `IN_7_DAYS → +6`, `DUE_ON_RECEIPT → +0` table as the invoice form.
  2. **Applies [Dynamic Fields](#dynamic-fields--settingsdynamic-fields-display-only)** to every line description (`{{month-year}}` / `{{invoice date}}` / `{{due date}}`). Substitution is one-shot — the resolved string is frozen into `InvoiceItem.description`.
  3. **Computes totals** (`subtotal`, `taxAmount`, `totalAmount`) using a shared backend util — same code path as `InvoicesService.create`.
  4. **Inserts the Invoice** in a single transaction with `status = DRAFT` (always), `invoiceNumber = MAX + 1`, `customerId` / `billingCompanyId` / `poNumber` / `paymentDetails` / `internalNotes` / `terms` copied from the rule, `recurringRuleId` back-pointer set, and one `InvoiceItem` per `RecurringRuleLineItem` with `quantity = 1`.
  5. **If `sendingOption === SEND_DIRECTLY`**, calls `InvoiceMailService.send(invoice.id)`. That entry point owns the synchronous first SMTP attempt, the `invoice-mail` BullMQ queue for 3 retries (10-min fixed backoff, 4 attempts total), the eventual `status = FAILED_TO_SEND` flip on final failure, and the Telegram + Resend notifications. No duplicated send logic.
  6. **Advances `nextRunAt`** by `intervalCount × intervalUnit` (calendar math with day-of-month clamping for `MONTHS` / `YEARS`). The advance happens whether the send succeeded, failed, or wasn't attempted.
- **Skip conditions** (logged warning, `nextRunAt` left alone): `customerId` null, `customer.billingCompany` null, `recurringScheduleId` null, or `lineItems.length === 0`.
- **Customer-delete protection:** `CustomersService.remove(id)` counts referencing `Invoice` + `RecurringRule` rows and throws `ConflictException` when either is non-zero. The frontend surfaces the 409 inline on the customer edit page.
- Changing the timezone in Preferences requires a backend restart to re-register the cron with the new TZ.

---

## Tasks

Lightweight todo list, also accessible via the Telegram bot. Backend module: `tasks`. Route prefix: `/tasks`.

### Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | cuid | auto | |
| `title` | string | yes | 1–200 chars |
| `description` | text | no | 6-line textarea on the edit page |
| `status` | enum | yes | `PENDING` / `IN_PROGRESS` / `COMPLETED` / `CANCELLED` |
| `dueDate` | datetime | no | |
| `startedAt` | datetime | auto | Stamped first time status → `IN_PROGRESS` |
| `completedAt` | datetime | auto | Stamped first time status → `COMPLETED` |
| `cancelledAt` | datetime | auto | Stamped first time status → `CANCELLED` |
| `createdAt` / `updatedAt` | datetime | auto | UI label "Created on" / "Last edited at" |

### List page — `/tasks`
Bespoke client component (`tasks-board.tsx`) — does **not** use the shared `<ListTable>` because rows have an inline checkbox + delete-button action. Pagination is reimplemented with the same `<Pagination>` primitive and `DEFAULT_PAGE_SIZE`.
- **Columns:** checkbox (toggle complete) · Task (title + description preview, links to edit page) · Status · Created at · Completed at · delete
- **Search & filter:** Title (text) · Description (text) · Created from (date) · Created to (date) · Status (select)
- **Default sort:** status priority (`PENDING` → `IN_PROGRESS` → `COMPLETED` → `CANCELLED`), then `createdAt` desc within each bucket. Status headers are not click-sortable here (custom sort).
- **Create flow:** "+ New task" button opens a dialog inline on the list page (Title · Description · Status).

### Edit page — `/tasks/[id]`
- **Row 1:** Title (required, full width)
- **Row 2:** Status (select, all 4 values) · Due Date
- **Row 3:** Description (6-line textarea, full width)
- **Audit footer:** Created on · Started on · Completed on · Cancelled on (read-only, `dd/mm/yyyy HH:MM AM/PM`, left-aligned).

### Logic
- Service auto-stamps the audit field corresponding to the status the task **first enters**. Going PENDING → IN_PROGRESS → COMPLETED stamps `startedAt` then `completedAt`. Re-entering a status does **not** re-stamp.
- Date filter on the list uses `createdAt` and compares against `00:00:00` of "Created from" and `23:59:59.999` of "Created to".
- Validation is shared with the Telegram bot — `/newtask <title>` uses the same `CreateTaskDto` + class-validator as the HTTP API. Single source of truth.
- Telegram `/tasks` command lists open tasks with inline ✓ Complete / ✗ Cancel buttons that call `TasksService` directly.

---

## Settings

All Settings routes live under `/settings/<section>`. The sidebar of the Settings layout uses vertical tabs (`/settings` itself redirects to `/settings/preferences`).

### Preferences — `/settings/preferences` (singleton)
| Field | Type | Default | Notes |
|---|---|---|---|
| `timezone` | string (IANA TZ) | `Australia/Perth` | Used by the BullMQ cron — restart backend to apply changes |
| `financialYearStart` | int (1–12) | `7` (July) | Calendar month the fiscal year begins |

- **Form layout:** Timezone (select) · Financial Year Start (select of month names). Save button bottom-right.
- Defaults apply both to the Prisma schema (`@default`) and the seeded singleton — fresh installs land on Australia/Perth + July with no further action.
- `dateFormat` is **not** present (removed by spec). Date formatting in the UI uses fixed `en-US` / hand-coded `dd/mm/yyyy HH:MM AM/PM` patterns.

### Mail Configuration — `/settings/mail-configuration` (singleton)
| Field | Type | Notes |
|---|---|---|
| `smtpServer` | string | |
| `port` | int | Default 587 |
| `encryption` | enum | `NONE` / `SSL` / `TLS` / `STARTTLS` |
| `user` | string | |
| `password` | string | Stored in DB (not encrypted at rest — boilerplate trade-off; revisit before prod) |

- **Form layout:** SMTP Server · Port (number) · Encryption (select) · User · Password (masked) · Save.

### Dynamic Fields — `/settings/dynamic-fields` (display-only)
Read-only reference page listing the placeholder tokens that resolve to live values when used in templated text (currently Item descriptions; future: invoice notes / email templates). Single source of truth: [frontend/lib/dynamic-fields.ts](frontend/lib/dynamic-fields.ts) — both the Settings table and the substitution function read from the same `DYNAMIC_FIELDS` constant, so the docs and behaviour can't drift.

| Token | Resolves to |
|---|---|
| `{{month-year}}` | The current month-year at the time of resolution, e.g. `May-2026`. |
| `{{invoice date}}` | The host invoice's Invoice Date in `dd/mm/yyyy`. |
| `{{due date}}` | The host invoice's Due Date in `dd/mm/yyyy`. |
| `{{invoice number}}` | The host invoice's number (e.g. `INV-1024`). Deferred: kept literal when typed into Item descriptions, resolves when the email template renders. The legacy underscore form `{{invoice_number}}` is still accepted by the resolver. |
| `{{customer name}}` | The customer the invoice is addressed to. Same deferred-resolution rule as `{{invoice number}}`. The legacy underscore form `{{customer_name}}` is still accepted. |
| `{{billing company}}` | The name of the Billing Company that issued the invoice. Use in email subject lines and bodies. Same deferred-resolution rule as `{{invoice number}}`. |
| `{{accounts email}}` | The Billing Company's accounts email (the address invoices are sent from). Same deferred-resolution rule as `{{billing company}}`. |

Backend resolution lives in [backend/src/common/dynamic-fields.ts](backend/src/common/dynamic-fields.ts) — a mirror of the frontend registry — and is invoked by `MailService.sendInvoice` and `InvoicesService.sendContext`.

Tokens are **case-insensitive** and tolerate inner whitespace (`{{ Invoice Date }}` matches). Substitution is **one-shot at the point of use**: when an Item is picked into an invoice line the placeholders are resolved using that invoice's current dates and the result is written into the line description; subsequent date edits on the invoice don't retroactively rewrite the line.

### Tax Types — `/settings/tax-types`
Catalog of tax rates available on invoice line items.
| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | e.g. "GST" |
| `rate` | decimal(6,3) | yes | 0–100, percent |
| `description` | text | no | |
| `isActive` | boolean | no | |

- **List columns:** Name · Rate · Description · Status · edit + delete actions.
- **Default sort:** Status asc (Active first), tie-breaker Name asc.
- **Create / edit:** Dialog with Tax Name · Rate % · Description · Active switch.

### Recurring Schedules — `/settings/recurring-schedules`
Catalog of cadences picked from the Recurring Invoice edit page. Sidebar entry sits between Tax Types and Dynamic Fields.
| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string (unique) | yes | e.g. "Every week", "Every 4 weeks", "Every month", "Every quarter" |
| `intervalUnit` | enum | yes | `DAYS` / `WEEKS` / `MONTHS` / `YEARS` |
| `intervalCount` | int | yes | ≥ 1; e.g. "Every 4 weeks" → unit `WEEKS`, count `4` |
| `isActive` | boolean | no | |

- **Display:** the interval renders as "Every \<count\> \<unit\>" (e.g. "Every 2 weeks").
- **List columns:** Name · Interval · Status · edit + delete actions.
- **Default sort:** Status asc (Active first), tie-breaker Name asc.
- **Create / edit:** Dialog with Name · Interval Unit · Interval Count · Active switch (tax-types-manager pattern).

### Invoice & Email Templates — no UI surface
Both catalogues are seeded immutably in [backend/prisma/seed.ts](backend/prisma/seed.ts) (10 of each) and have **no settings pages, no list, no create/edit/delete dialogs**. The previous `/settings/invoice-templates` and `/settings/email-templates` pages have been retired along with the `POST`/`PATCH`/`DELETE` endpoints on their controllers. Templates are assigned to companies via the rotation rule documented under [Billing Companies → Logic](#logic), and snapshotted onto each Invoice at create.

To change template content: edit the seed (and, for invoice designs, the matching `backend/src/pdf/templates/<templateKey>.tsx` module) and either `docker compose down -v && docker compose up -d` (full reseed) or apply a targeted UPDATE via `docker exec simplebooks-backend-1 node -e '…'` against `EMAIL_TEMPLATE_SPECS`. Email templates ship today as ten palette-matched variants of the same bulletproof-table layout — `email-grey-1` (design-1), `email-orange-1` (design-2), `email-blue-1` (design-3), `email-orange-2` (design-4), `email-blue-grey-1` (design-5), `email-pink-berry` (design-6), `email-green-pro` (design-7), `email-green-elegance` (design-8), `email-brown-black` (design-9), `email-blue-simple` (design-10) — each with subject + body styled to the matching PDF template's palette so the email-to-PDF brand feel stays consistent. The seed's [`recolor()`](backend/prisma/seed.ts) helper swaps the page background, header/footer bar, and CTA button colour per slot.

### Telegram — `/settings/telegram`
- **Top card:** Bot connection status — Token configured, Mode (Webhook / Long polling), Webhook domain, Connected chats, Allowlisted users. Amber callout when token is unset, pointing to `.env` + @BotFather.
- **Allowlist table:** Username · User · Bot Name · Bot Token · Note · delete. Banner above the table reads "Bot Token field is for reference only — the actual token must be set in `.env` as `TELEGRAM_BOT_TOKEN`".
- **Add user dialog fields:** Telegram Username (required) · User · Bot Name · Bot Token · Note (all optional).
- **Bot commands card:** quick reference for `/start`, `/help`, `/tasks`, `/newtask <title>`.

#### `TelegramAllowlist` fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string (unique, lowercase) | yes | Strips leading `@`, case-insensitive |
| `user` | string | no | Display name for admin reference |
| `botName` | string | no | Reference only |
| `botToken` | string | no | Reference only — actual token comes from `.env` |
| `note` | string | no | |

### Roles · Users
Backend models for Roles and Users do not exist yet — those tabs render a "coming soon" placeholder. Add the models + endpoints + UI following the patterns from Tax Types / Mail Configuration when ready.

### Account Types — `/settings/account-types`
Catalog of account types used by the Accounts module. Seeded with 6 rows: Everyday, Savings, Credit Card, Loan, Cash, Offset.
| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string (unique) | yes | |
| `isActive` | boolean | no | |

- **List columns:** Name · Status · edit + delete actions.
- **Default sort:** Status asc (Active first), tie-breaker Name asc.
- **Create / edit:** Dialog with Name · Active switch (tax-types-manager pattern).
- FK is `RESTRICT` — an account type cannot be deleted while any account references it.

### Import Logs — `/settings/import-logs`
Read-only list of every CSV import attempt. Sidebar entry under Settings.
- **List columns:** Account · Filename · Date · Rows Total · Imported · Skipped (dup) · Failed · link to detail.
- **Default sort:** `importedAt` desc.
- **Detail page** `/settings/import-logs/[id]`: re-renders the same `<ImportReportPopup>` component shown immediately after import. Single source of truth — both views read the `ImportReport` JSON shape stored in `TransactionImport.reportJson`.
- No delete endpoint. Records are immutable once created.

---

## Banking

### Accounts

Bank accounts the user tracks. Backend module: `accounts`. Route prefix: `/accounts`.

#### Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | auto | |
| `name` | string | **yes** | |
| `bank` | string | **yes** | |
| `accountNumber` | string | no | |
| `accountTypeId` | FK → AccountType | **yes** | |
| `openingBalance` | decimal(14,2) | no | default `0` |
| `openingDate` | date | **yes** | default today (local calendar — use `localIsoDate()`) |
| `notes` | text | no | |
| `isActive` | boolean | no | default `true` |
| `createdAt` / `updatedAt` | datetime | auto | |

#### List page — `/accounts`
- **Columns:** Account · Bank · Type · Current balance · Transactions count · Status.
- **Default sort:** `isActive` desc (Active first), tie-breaker `name` asc.

#### Edit page — `/accounts/[id]` (and `/accounts/new`)
Uses `EditPageChrome`.
- **Row 1:** Name (required) · Bank (required)
- **Row 2:** Account Number · Account Type (required, select)
- **Row 3:** Opening Balance · Opening Date (required)
- **Row 4:** Notes (full-width textarea)
- **Right action:** Archive / Restore button (toggles `isActive`). Renders as an outline button in the header's `rightActions` slot.

#### Detail page — `/accounts/[id]`
A separate read-oriented view (not the edit page). Contains:
- `<AccountHeaderCard>` — shows name, bank, account type, current balance, last import link, and an Edit button.
- `<ImportCsvButton>` — launches the sniff → confirm-mapping → commit CSV import flow.
- `<TransactionsTable mode="account">` — server-side paginated list scoped to this account.

#### Logic
- Current balance = `openingBalance + SUM(Transaction.amount)`. Computed server-side; not stored.
- Deleting an account cascades to all its `Transaction` and `TransactionImport` rows.

---

### Transactions

Read-only list of bank-statement lines. Backend module: `transactions`. Route prefix: `/transactions`.

**This is the first module in the app with server-side filter, sort, and pagination.** State is URL-driven: `?accountIds=&dateFrom=&dateTo=&sortBy=&sortDir=&page=`. The frontend reads searchParams and passes them to the API; no client-side filter pass.

#### Fields (per row)
| Field | Notes |
|---|---|
| `date` | Transaction date (not import date) |
| `description` | As imported from the CSV |
| `amount` | SIGNED decimal — negative = debit, positive = credit |
| `runningBalance` | Bank-supplied balance after this row; may be null |
| `accountId` | Parent account |
| `importHash` | Dedupe key; not shown in UI |

#### List columns
- **Account mode** (rendered within `/accounts/[id]` via `<TransactionsTable mode="account">`): Date · Description · Amount · Balance.
- **Global mode** (at `/transactions`): adds Account column before Date.

#### Pagination & sorting
- **Page size: 200 rows** (overrides the project default of 100).
- **Default sort:** `date desc`, `id desc` (stable tie-breaker within one day).
- Sort and page are URL parameters — navigating back preserves position.

#### Filters
- Date range (`dateFrom` / `dateTo`), both optional.
- In global mode: Account multi-select (`accountIds`).
- No client-side filter pass — all filtering goes through the backend query.

#### Amount rendering
- Positive (credit): `text-green-700`.
- Negative (debit): `text-red-700`.
- Always `font-mono tabular-nums` for column alignment.

---

### CSV Import flow (via `<ImportCsvButton>`)
Two-step flow launched from the account detail page:

1. **Sniff** — `POST /transaction-imports/sniff` (multipart, 10 MB limit). Returns detected columns, a sample of rows, and a suggested field mapping.
2. **Confirm mapping modal** — user reviews and adjusts the column → field mapping. Phase B adds a **"Categorise based on rules"** checkbox at this step. When ticked the rule engine runs over just-inserted transactions after the import's own Prisma transaction commits (engine needs the inserts visible). The `ImportReport` gains a `ruleCategorisation` section summarising how many transactions were categorised, how many already had a category, and how many the engine couldn't match.
3. **Commit** — `POST /transaction-imports/commit` (multipart, 10 MB limit). Inserts rows, deduplicates by `@@unique([accountId, importHash])`, creates a `TransactionImport` record, returns an `ImportReport`.
4. **`<ImportReportPopup>`** — displays the import summary (rows total / imported / skipped / failed, plus the optional `ruleCategorisation` section). The same component renders on the persisted log detail page at `/settings/import-logs/[id]`.

Duplicate detection hash: sha256 of `date|amount.toFixed(2)|normaliseDesc(description)|runningBalance ?? ''`, uniqued per account.

---

---

### Categories

Lookup catalog for transaction categories. Backend module: `categories`. Route prefix: `/categories`.

#### Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | auto | |
| `name` | string | **yes** | UNIQUE |
| `kind` | enum `CategoryKind` | **yes** | `INCOME` / `EXPENSE` / `TRANSFER` / `OTHER` |
| `isActive` | boolean | no | default `true` |
| `sortOrder` | int | no | default `100`; lower = earlier in dropdowns |
| `createdAt` / `updatedAt` | datetime | auto | |

#### List page — `/categories`
- **Columns:** Name · Kind · Sort Order · Status.
- **Default sort:** `isActive` desc, tie-breaker `sortOrder` asc, then `name` asc.

#### Edit page — `/categories/[id]` (and `/categories/new`)
- **Row 1:** Name (required) · Kind (required, select)
- **Row 2:** Sort Order · Active (switch)

#### Logic
- Delete blocked with 409 if any `Transaction`, `TransactionSplit`, or `Rule` references the category.
- Kind controls badge colour in the UI — see DesignSystem.md for token values.
- `sortOrder` controls the order categories appear in dropdowns throughout the app (transaction category picker, split modal, rule editor). Lower = first.

---

### Vendors

Lookup catalog for payees/merchants. Backend module: `vendors`. Route prefix: `/vendors`.

#### Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | auto | |
| `name` | string | **yes** | UNIQUE |
| `kind` | enum `VendorKind` | **yes** | `VENDOR_MATCH` |
| `aliases` | string[] | no | lowercase substrings; matching is case-insensitive whitespace-collapsed. Trailing spaces in an alias prevent false-positive partial matches on similar but distinct descriptions. |
| `notes` | string | no | |
| `isActive` | boolean | no | default `true` |
| `createdAt` / `updatedAt` | datetime | auto | |

#### List page — `/vendors`
- **Columns:** Name · Kind · Aliases (count or preview) · Status.
- **Default sort:** `isActive` desc, tie-breaker `name` asc.

#### Edit page — `/vendors/[id]` (and `/vendors/new`)
- **Row 1:** Name (required) · Kind (required, select)
- **Row 2:** Aliases (tag input, each stored lowercase) · Active (switch)
- **Row 3:** Notes (textarea, full width)

#### Extraction wizard — `/vendors/extract`
Two-step process for bulk-creating vendors from unrecognised transaction descriptions:
1. `POST /vendors/extract` — analyses transaction descriptions not yet matched to a vendor, proposes name + aliases for each cluster.
2. User reviews and edits proposals in a table.
3. `POST /vendors/extract/commit` — saves accepted proposals as new `Vendor` rows.

#### Logic
- Vendor matching: the engine checks each transaction description against all active vendors' `aliases`. Matching is case-insensitive and whitespace-collapsed. When multiple vendors match, the one with the longest matching alias wins (most-specific tiebreak).

---

### Rules

Categorisation rules. Backend module: `rules`. Route prefix: `/rules`.

#### Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | auto | |
| `name` | string | **yes** | |
| `state` | enum `RuleState` | auto | `USER` (default) / `AI_DRAFTED` / `APPROVED` / `DENIED`. Only `USER` is fully reachable in Phase B; the other values are scaffolded for Phase C AI integration. |
| `isActive` | boolean | no | default `true` |
| `priority` | int | no | default `1000`; spaced by 10 in practice. Lower = higher precedence. |
| `categoryId` | FK → Category | **yes** | applied to matched transactions |
| `vendorId` | FK → Vendor | no | optionally applied to matched transactions |
| `noteOnApply` | string | no | appended to `Transaction.notes` when the rule fires |
| `hitCount` | int | auto | incremented by the engine on each pass |
| `lastFiredAt` | datetime | auto | stamped by the engine on each pass |
| `conditions` | RuleCondition[] | ≥1 | AND-only — all conditions must match |
| `createdAt` / `updatedAt` | datetime | auto | |

#### List page — `/rules`
- The rules list is **priority-ordered, not FilteredList**. Rows render in ascending priority order (rank 1 = lowest priority INT = fires first).
- Each row shows a priority rank prefix in `font-mono text-lg tabular-nums text-slate-400` (e.g. `#1`, `#2`).
- **Columns:** Rank · Name · State · Category · Vendor · Conditions count · Hit Count · Active.
- **Actions per row:** `[↑]` / `[↓]` reorder buttons (swap with neighbour via `PATCH /rules/:id/move`). Edit. Toggle active.
- **No sort or filter** — the order IS the feature.

#### Edit page — `/rules/[id]` (and `/rules/new`)
Uses `EditPageChrome`.
- **Row 1:** Name (required) · State (select) · Active (switch)
- **Row 2:** Category (required, select — sorted by `sortOrder`) · Vendor (optional, select)
- **Conditions section:** a list of condition rows, each with Field / Operator / Value / Value2 / ValueList inputs appropriate to the operator. "+ Add Condition" below the list.
- **Row (footer):** Note on Apply (textarea)

#### Sample-matches preview
The rule editor hits `POST /rule-engine/test` on debounce as the user edits conditions — a dry-run with no side effects. Results appear inline below the conditions section showing which transactions in a sample set would match this rule.

#### Logic
- Rules are evaluated priority-order (ascending INT). First matching rule wins — subsequent rules are skipped for that transaction.
- All conditions within a rule are AND — every condition must be satisfied.
- The move endpoint swaps the rule's `priority` with its immediate neighbour. Priority is spaced by 10; if consecutive rules collapse to a gap of 1, a future improvement should rebalance all priorities transactionally (not implemented in Phase B).

---

### Categorisation Engine

Backend module: `rule-engine`. No database table of its own — pure orchestration.

#### Two-pass evaluation
1. **Vendor-match pass:** for each transaction, check all active vendors' `aliases`. If one or more match, assign the vendor with the longest matching alias (most-specific wins). This pass sets `Transaction.vendorId` but does not set `categoryId`.
2. **Rule-match pass:** evaluate active, `isActive=true` rules in ascending `priority` order. For each transaction, the first rule whose AND-conditions all match wins. Assigns `categoryId`, optionally `vendorId` (if the rule specifies one), optionally appends `noteOnApply` to `Transaction.notes`, and stamps `categorisedAt`.

#### Engine writes
- All writes for a batch run are wrapped in a single Prisma `$transaction`.
- A `CategorisationEvent` row (source=`RULE`) is written for every categorisation change.
- `Rule.hitCount` is incremented and `Rule.lastFiredAt` is stamped for each rule that fires.

#### Dry-run mode
`POST /rule-engine/test` accepts `dryRun=true`. No rows are written. Returns a results table with the winning rule for each transaction plus any also-matched rules.

---

### Transaction Splits

A transaction can be split across multiple categories. Accessed via `POST /transactions/:id/splits` and `DELETE /transactions/:id/splits`.

#### Rules
- A transaction has either `categoryId` set (single-category) OR 1+ `TransactionSplit` rows — never both simultaneously. Setting splits clears `categoryId`; deleting all splits restores single-category mode.
- `SUM(split.amount)` must equal `Transaction.amount` (enforced server-side; returns 422 if not balanced).
- The split modal tracks an **Allocated** running total and a **Remaining** figure. The Save button is disabled until Remaining = $0.00.

---

### Test Rules Sandbox — `/rules/test`

Standalone page for testing rules against a sample of real transactions without making any changes.

- **Amber warning banner** (mandatory): "This is a sandbox. Nothing on this page changes any transaction."
- **Source picker:** choose existing transactions by date range and account, OR upload a CSV file.
- **Rule selection:** choose one or more rules to test (or "all active rules").
- **Results table:** for each transaction in the sample, shows the winning rule (if any) and all also-matched rules.
- All hits go through `POST /rule-engine/test` with `dryRun=true`.

---

### Categorisation Events — `/categorisation-events`

Read-only audit trail. Backend module: `categorisation-events`. Route prefix: `/categorisation-events`.

- **Columns:** Date · Transaction · Source · Rule (if applicable) · Old Category · New Category · Old Vendor · New Vendor.
- **Default sort:** `createdAt` desc.
- No create, update, or delete endpoints. Rows are written only by the engine, the manual-patch endpoint, and the import opt-in path.

---

## Cross-module conventions

- **DTOs are the source of truth** for input validation. Both HTTP controllers and the Telegram bot run inputs through the same `class-validator` DTOs — never duplicate rules.
- **Auto-incrementing numbers** (`invoiceNumber`, `customerNumber`): computed as `MAX + 1` in the service, not Postgres sequences. Seed defines the starting value.
- **Audit timestamps** (`createdAt`, `updatedAt`, plus per-status stamps where applicable): set by the database / service, never accepted from user input.
- **List pages**: 100 rows per page with pagination (Pagination footer always rendered when ≥1 row); default sort is "active first, then alphabetical" for entities with `isActive`, or a domain-specific default otherwise. All meaningful columns sortable with caret icons in the header.
- **Filter panel**: pops open from a Filter button next to the page's "New" button. Supports `text`, `select`, and `date` field types. Page resets to 1 on filter or sort change. Background `rgb(212 215 225 / 79%)`.
- **Frontend**: server component page loads data via `lib/api.ts`, hands off to a client `*-list.tsx` (lists) or `*-form.tsx` (edit) for interactivity.
- **Forms**: required fields show a red asterisk via the `<Field required>` prop. Audit timestamps render at the bottom of the card in `dd/mm/yyyy HH:MM AM/PM`, left-aligned.
