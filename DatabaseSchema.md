# DatabaseSchema.md

Postgres schema for SimpleBooks. Generated from [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — when the Prisma schema changes, update this file too.

For per-module *field semantics, required flags, UI surface, and business logic*, see [modules_and_logic.md](modules_and_logic.md). This file is the **data shape** reference.

## Conventions

- IDs are `UUID v4` (`@default(uuid())`) **except** `User`, `Task`, and `TelegramChat`, which use `cuid` (`@default(cuid())`) for legacy reasons.
- Money columns are `Decimal(12, 2)` for invoice values. Banking money columns use `Decimal(14, 2)` — account balances accumulated over years can exceed the 10-digit integer cap of `(12, 2)`. Tax rates are `Decimal(6, 3)` (percent, 0–100 with three decimal places).
- Decimals serialize to **strings** over JSON — always wrap with `Number(...)` on the frontend before arithmetic.
- All "active/inactive" flags are stored as `Boolean isActive @default(true)`.
- `createdAt` is `DateTime @default(now())`. `updatedAt` is `DateTime @updatedAt` (Prisma auto-touches it on every write).
- Migrations are **not** used — the backend entrypoint runs `prisma db push --accept-data-loss` on every boot. Non-additive schema edits (column drops, type changes, new required columns on populated tables) require `docker compose down -v` first.

## Enums

| Enum | Values |
|---|---|
| `PaymentTerms` | `IN_28_DAYS`, `IN_15_DAYS`, `IN_7_DAYS`, `DUE_ON_RECEIPT` |
| `InvoiceStatus` | `DRAFT`, `SENT`, `VIEWED`, `PARTIAL_PAID`, `PAID`, `VOID`, `FAILED_TO_SEND` |
| `TaskStatus` | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `RecurringIntervalUnit` | `DAYS`, `WEEKS`, `MONTHS`, `YEARS` |
| `SendingOption` | `REVIEW_BEFORE_SENDING`, `SEND_DIRECTLY` |
| `SendVia` | `GENERAL_SMTP`, `CUSTOM_SMTP` |
| `EmailEncryption` | `NONE`, `SSL`, `TLS`, `STARTTLS` |
| `CategoryKind` | `INCOME`, `EXPENSE`, `TRANSFER`, `OTHER` |
| `VendorKind` | `VENDOR_MATCH` (Phase B; further values scaffolded for Phase C) |
| `RuleState` | `USER`, `AI_DRAFTED`, `APPROVED`, `DENIED` |
| `RuleField` | Fields a rule condition can match against (e.g. `DESCRIPTION`, `AMOUNT`, `DATE`) |
| `RuleOperator` | Comparison operators for rule conditions (e.g. `CONTAINS`, `EQUALS`, `GT`, `LT`, `BETWEEN`, `IN_LIST`) |
| `EventSource` | `MANUAL`, `RULE`, `VENDOR_MATCH`, `AI_DRAFT`, `AI_APPLIED`, `AI_REJECTED` (Phase C) — records what triggered a `CategorisationEvent`. `AI_REJECTED` added in Phase C. |
| `AiCallPurpose` | `CATEGORISE`, `DRAFT_RULE` — **(Phase C)** purpose of an `AiCall` row |
| `AiCallStatus` | `OK`, `FAILED` — **(Phase C)** outcome of an `AiCall` row |
| `AllocationEventType` | `CREATED`, `DELETED` — **(Phase D)** audit-log event type |
| `AllocationEventSource` | `USER` — **(Phase D)** origin of the allocation change. Single value today; reserved for future automated sources. |

## Models

### User
| Column | Type | Constraints |
|---|---|---|
| `id` | cuid | PK |
| `email` | string | UNIQUE |
| `name` | string? | |
| `createdAt` | datetime | default `now()` |
| `updatedAt` | datetime | auto-touched |

Relations: `tasks Task[]`, `telegramChats TelegramChat[]`.

Notes: There is no auth flow yet; the User table is used to associate tasks and Telegram chats. Seed creates a single owner.

---

### Customer
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `customerNumber` | int | UNIQUE — service-generated (`MAX + 1`, starts at 1001) |
| `name` | string | |
| `billingEmail1` | string? | "Primary billing email" in UI; required at the DTO level |
| `billingEmail2` | string? | "Secondary billing email" |
| `billingCompanyId` | UUID? | FK → `BillingCompany.id` (ON DELETE SET NULL); required at DTO level |
| `paymentTerms` | enum `PaymentTerms` | default `IN_28_DAYS` |
| `address` | string? | required at DTO level; multi-line plain text |
| `notes` | string? | |
| `isActive` | bool | default `true` |
| `createdAt` / `updatedAt` | datetime | |

Relations: `billingCompany BillingCompany?`, `invoices Invoice[]`, `recurringRules RecurringRule[]`.

---

### BillingCompany
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | |
| `abn` | string? | required at DTO level |
| `address` | string? | required at DTO level; multi-line plain text |
| `paymentDetails` | string? | required at DTO level; sanitized HTML (B/I/U + line breaks) |
| `accountsEmail` | string? | required at DTO level |
| `invoiceBcc` | string | default `""`; DTO requires non-empty email |
| `notes` | string? | |
| `isActive` | bool | default `true` |
| `deactivatedAt` | datetime? | service-stamped when `isActive` flips true → false; cleared on re-activation |
| `sendVia` | enum `SendVia` | default `GENERAL_SMTP`. `CUSTOM_SMTP` routes outbound invoice mail through the five `customSmtp*` fields below; otherwise the `MailConfiguration` singleton is used. |
| `customSmtpServer` | string? | |
| `customSmtpPort` | int? | |
| `customSmtpEncryption` | enum `EmailEncryption`? | |
| `customSmtpUser` | string? | |
| `customSmtpPassword` | string? | Plain text — same boilerplate trade-off as `MailConfiguration.password`. |
| `creationOrder` | int? | UNIQUE — 1-based ordinal assigned atomically in `CompaniesService.create`. Used by the rotation rule for permanent template assignment: `displayOrder = ((creationOrder - 1) % N) + 1`. |
| `invoiceTemplateId` | UUID? | FK → `InvoiceTemplate.id` (ON DELETE RESTRICT). Set once at create; immutable thereafter. |
| `emailTemplateId` | UUID? | FK → `EmailTemplate.id` (ON DELETE RESTRICT). Set once at create; immutable thereafter. |
| `createdAt` / `updatedAt` | datetime | |

Relations: `customers Customer[]`, `invoices Invoice[]`, `recurringRules RecurringRule[]`, `invoiceTemplate InvoiceTemplate?`, `emailTemplate EmailTemplate?`.

---

### Item
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | |
| `unitPrice` | decimal(12,2) | |
| `description` | string? | |
| `isActive` | bool | default `true` |
| `createdAt` / `updatedAt` | datetime | |

Relations: `invoiceItems InvoiceItem[]`.

---

### Invoice
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `invoiceNumber` | int | UNIQUE — service-generated (`MAX + 1`, starts at 1000) |
| `invoiceDate` | datetime | default `now()` |
| `dueDate` | datetime? | |
| `customerId` | UUID? | FK → `Customer.id` (ON DELETE SET NULL) |
| `billingCompanyId` | UUID? | FK → `BillingCompany.id` (ON DELETE SET NULL) |
| `status` | enum `InvoiceStatus` | default `DRAFT` |
| `subtotal` | decimal(12,2) | default `0`; service-computed from line items |
| `taxAmount` | decimal(12,2) | default `0`; service-computed |
| `totalAmount` | decimal(12,2) | default `0`; service-computed (`subtotal + taxAmount`) |
| `poNumber` | string? | |
| `paymentDetails` | string? | sanitized HTML |
| `internalNotes` | string? | not shown to customer |
| `terms` | string? | |
| `recurringRuleId` | UUID? | FK → `RecurringRule.id` (ON DELETE SET NULL); set when generated by the cron sweeper |
| `invoiceTemplateId` | UUID? | FK → `InvoiceTemplate.id` (ON DELETE RESTRICT). Snapshotted from the parent `BillingCompany` at creation; frozen for the lifetime of the invoice. |
| `emailTemplateId` | UUID? | FK → `EmailTemplate.id` (ON DELETE RESTRICT). Snapshotted from the parent `BillingCompany` at creation; frozen for the lifetime of the invoice. |
| `sendAttempts` | int | default `0`. Counts total SMTP attempts made for this invoice (synchronous first attempt + up to 3 BullMQ-retried attempts = 4 max). |
| `sendError` | string? | Most recent SMTP error verbatim. Surfaced in the failure-notification body. |
| `lastSendAt` | datetime? | Timestamp of the most recent send attempt (success or failure). |
| `publicToken` | string? | UNIQUE. 32-byte URL-safe random (~43 chars). Minted lazily the first time the invoice is sent; backs the customer-facing `/i/:token` route. Never expires, never rotated. |
| `publicTokenIssuedAt` | datetime? | Timestamp the token was first minted. Audit-only — no expiry is enforced. |
| `viewedAt` | datetime? | First-view timestamp stamped by `GET /public/invoices/:token`. Same-transaction flip from `status = SENT` to `status = VIEWED`. Idempotent — only set when null and only when status is `SENT`. |
| `voidReason` | string? | Operator-supplied free-text reason captured by the Void confirmation modal. Stays readable on the row forever; survives even though the dashboard excludes VOIDs from aggregates. |
| `voidedAt` | datetime? | Stamp of the most recent void (same transaction that flips `status` to `VOID`). Re-voiding overwrites both `voidReason` and `voidedAt`. |
| `amountPaid` | decimal(12,2) | **(Phase D)** default `0`. Denormalised sum of all `Allocation.amount` rows pointing at this invoice. Maintained by `recomputeInvoicePayment` inside `PaymentsService` allocation transactions; backfilled on first boot. Do not write from outside `PaymentsService`. |
| `amountOutstanding` | decimal(12,2) | **(Phase D)** default `0`. Denormalised `totalAmount − amountPaid`. Maintained by the same recompute step. |
| `createdAt` / `updatedAt` | datetime | |

Relations: `customer`, `billingCompany`, `recurringRule`, `lineItems InvoiceItem[]`, `invoiceTemplate InvoiceTemplate?`, `emailTemplate EmailTemplate?`, `allocations Allocation[]` (Phase D).

**`InvoiceStatus.PARTIAL_PAID` is now load-bearing** — written by `PaymentsService` when an invoice has at least one allocation but `amountOutstanding > 0`. UI display order: `DRAFT → SENT → VIEWED → PARTIAL_PAID → PAID → VOID`. Manual status edits on the edit form are restricted to `DRAFT` / `VOID`; `SENT` / `VIEWED` / `PARTIAL_PAID` / `PAID` are derived and read-only on the form.

---

### InvoiceItem
Composite child of `Invoice`. Cascade-deleted with parent.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `invoiceId` | UUID | FK → `Invoice.id` (ON DELETE **CASCADE**) |
| `itemId` | UUID? | FK → `Item.id` (ON DELETE SET NULL) |
| `description` | string | required |
| `quantity` | decimal(12,2) | |
| `unitPrice` | decimal(12,2) | |
| `lineAmount` | decimal(12,2) | service-computed (`quantity * unitPrice`) |
| `taxTypeId` | string? | forward-compat — not currently FK-linked to `TaxType` |
| `taxName` | string? | free-text label, e.g. "GST" |
| `taxRate` | decimal(6,3)? | percent 0–100 |
| `taxAmount` | decimal(12,2) | default `0`; service-computed (`lineAmount * taxRate / 100`) |
| `position` | int | default `0`; source order within the invoice |

Service replaces the entire `lineItems` collection on update (delete-all + create-all inside a transaction).

---

### Task
| Column | Type | Constraints |
|---|---|---|
| `id` | cuid | PK |
| `title` | string | 1–200 chars (DTO) |
| `description` | string? | |
| `status` | enum `TaskStatus` | default `PENDING` |
| `dueDate` | datetime? | |
| `startedAt` | datetime? | service-stamped first time status enters `IN_PROGRESS` |
| `completedAt` | datetime? | service-stamped first time status enters `COMPLETED` |
| `cancelledAt` | datetime? | service-stamped first time status enters `CANCELLED` |
| `userId` | cuid? | FK → `User.id` (ON DELETE SET NULL) |
| `createdAt` / `updatedAt` | datetime | |

---

### RecurringSchedule
Settings-managed catalog of cadences. Picked by `RecurringRule` rows; surfaced at `/settings/recurring-schedules`.
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | UNIQUE — e.g. "Every week", "Every 4 weeks", "Every month" |
| `intervalUnit` | enum `RecurringIntervalUnit` | `DAYS` / `WEEKS` / `MONTHS` / `YEARS` |
| `intervalCount` | int | ≥ 1 |
| `isActive` | bool | default `true` |
| `createdAt` / `updatedAt` | datetime | |

Relations: `recurringRules RecurringRule[]`.

---

### RecurringRule
First-class invoice template — full line items + scheduling controls. Replaced wholesale in May 2026; the prior shape (`name`, `amount`, `currency`, `frequency`) is gone.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `scheduleName` | string | Service-derived `"<customer> - <schedule.name>"`, stored at save. Non-editable from the API. |
| `startDate` | datetime | First generation runs on/after this date. |
| `recurringScheduleId` | UUID? | FK → `RecurringSchedule.id` (ON DELETE SET NULL) |
| `sendingOption` | enum `SendingOption` | default `REVIEW_BEFORE_SENDING` |
| `active` | bool | default `true`; sweep ignores inactive rules |
| `nextRunAt` | datetime | = `startDate` at create; advanced by `intervalCount × intervalUnit` after each generation |
| `customerId` | UUID? | FK → `Customer.id` (ON DELETE SET NULL); required at DTO level |
| `billingCompanyId` | UUID? | FK → `BillingCompany.id` (ON DELETE SET NULL); derived from `customer.billingCompany` at save |
| `poNumber` | string? | Template default; copied onto every generated invoice |
| `paymentDetails` | string? | Sanitized HTML; auto-populates from billing company on customer change |
| `internalNotes` | string? | |
| `terms` | string? | |
| `createdAt` / `updatedAt` | datetime | |

Relations: `recurringSchedule RecurringSchedule?`, `customer Customer?`, `billingCompany BillingCompany?`, `lineItems RecurringRuleLineItem[]`, `invoices Invoice[]` (every generated invoice points back via `Invoice.recurringRuleId`).

---

### RecurringRuleLineItem
Composite child of `RecurringRule`. Cascade-deleted with parent. Mirrors `InvoiceItem` minus the computed-total columns — totals are recomputed per generation.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `recurringRuleId` | UUID | FK → `RecurringRule.id` (ON DELETE **CASCADE**) |
| `itemId` | UUID? | FK → `Item.id` (ON DELETE SET NULL) |
| `description` | string | May contain dynamic-field tokens (`{{month-year}}`, `{{invoice date}}`, `{{due date}}`); resolved at generation time |
| `unitPrice` | decimal(12,2) | The "Amount" column. Quantity is never surfaced — always written as `1` at generation. |
| `taxTypeId` | string? | forward-compat — not currently FK-linked to `TaxType` |
| `taxName` | string? | Snapshot of `TaxType.name` at save |
| `taxRate` | decimal(6,3)? | Snapshot of `TaxType.rate`; percent 0–100 |
| `position` | int | default `0`; source order |

---

### TelegramChat
| Column | Type | Constraints |
|---|---|---|
| `id` | cuid | PK |
| `chatId` | string | UNIQUE — Telegram chat id |
| `username` | string? | last-seen Telegram username (mutable on Telegram's side) |
| `userId` | cuid? | FK → `User.id` (ON DELETE SET NULL) |
| `createdAt` | datetime | |

---

### TelegramAllowlist
Gate for bot commands. The bot rejects any incoming message whose sender's username doesn't appear here.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `username` | string | UNIQUE — lowercased, leading `@` stripped |
| `user` | string? | display-name reference for admins |
| `botName` | string? | reference only |
| `botToken` | string? | reference only — **the actual token lives in `.env` as `TELEGRAM_BOT_TOKEN`**, never read from this column at runtime |
| `note` | string? | |
| `createdAt` | datetime | |

---

### TaxType
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | e.g. "GST" |
| `rate` | decimal(6,3) | percent 0–100 |
| `description` | string? | |
| `isActive` | bool | default `true` |
| `createdAt` / `updatedAt` | datetime | |

---

### InvoiceTemplate
Catalogue of 10 PDF designs. Seeded immutably — there is no runtime UI that mutates this table.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | e.g. `Design 1` |
| `templateKey` | string | UNIQUE — must match a key in [backend/src/pdf/templates/index.ts](backend/src/pdf/templates/index.ts). Lowercase letters / digits / hyphens. |
| `displayOrder` | int | UNIQUE — 1..10. Target of the rotation rule `((creationOrder - 1) % N) + 1`. |
| `createdAt` / `updatedAt` | datetime | |

Relations: `billingCompanies BillingCompany[]`, `invoices Invoice[]` — both via `Restrict`, so a template can't be deleted while referenced.

---

### EmailTemplate
Catalogue of 10 email subject + body designs. Seeded immutably.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | e.g. `Template 1` |
| `subject` | string | May contain dynamic-fields tokens; substituted server-side at send time. |
| `body` | string | HTML body. Tokens substituted at send time. HTML-only — there is no plain-text alternative. |
| `templateKey` | string | UNIQUE — lowercase letters / digits / hyphens. |
| `displayOrder` | int | UNIQUE — 1..10. Target of the rotation rule. |
| `createdAt` / `updatedAt` | datetime | |

Relations: `billingCompanies BillingCompany[]`, `invoices Invoice[]` — both via `Restrict`.

---

### Preferences (singleton)
Lazily created on first GET when absent.

| Column | Type | Default |
|---|---|---|
| `id` | UUID | |
| `timezone` | string (IANA TZ) | `Australia/Perth` |
| `financialYearStart` | int (1–12) | `7` (July) |
| `createdAt` / `updatedAt` | datetime | |

The recurring-invoice cron reads `timezone` once at backend boot — changing it via the UI requires a backend restart.

---

### MailConfiguration (singleton)
Lazily created on first GET when absent.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | UUID | | |
| `smtpServer` | string | `""` | |
| `port` | int | `587` | |
| `encryption` | enum `EmailEncryption` | `STARTTLS` | |
| `user` | string | `""` | |
| `password` | string | `""` | **Stored as plain text — not encrypted at rest. Boilerplate trade-off; revisit before production.** |
| `createdAt` / `updatedAt` | datetime | | |

---

## Banking

### AccountType
Lookup catalog for account types. Seeded with 6 rows: Everyday, Savings, Credit Card, Loan, Cash, Offset. User-editable via `/settings/account-types`.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | UNIQUE |
| `isActive` | bool | default `true` |
| `createdAt` / `updatedAt` | datetime | |

Relations: `accounts Account[]`. FK from `Account.accountTypeId` is `ON DELETE RESTRICT` — an account type cannot be deleted while any account references it (mirrors `BillingCompany → InvoiceTemplate`).

---

### Account
A bank account the user tracks. Opening balance + opening date anchor the running-balance computation: current balance = `openingBalance + SUM(Transaction.amount)`. Soft-delete only (`isActive`).

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | **UNIQUE** (`@unique`, btree index `Account_name_key`). The application service enforces case-insensitive uniqueness on the trimmed value before insert/update; the DB constraint is the case-sensitive backstop. |
| `bank` | string | |
| `accountNumber` | string? | |
| `accountTypeId` | UUID | FK → `AccountType.id` (ON DELETE **RESTRICT**) |
| `openingBalance` | decimal(14,2) | default `0` |
| `openingDate` | date | |
| `notes` | string? | |
| `isActive` | bool | default `true` |
| `createdAt` / `updatedAt` | datetime | |

Relations: `transactions Transaction[]`, `imports TransactionImport[]`.

---

### Transaction
A single bank-statement line. `amount` is SIGNED (negative = debit, positive = credit). Per-row running balance is **not stored** — it is computed server-side at query time via a SQL window function (`Account.openingBalance + SUM(amount) OVER (PARTITION BY accountId ORDER BY date, id)`) over the unfiltered, unpaginated per-account history and attached to each visible row. See CLAUDE.md gotchas.

Phase B promoted several forward-compat columns to real FKs and added new columns. The `vendorCustomerId` rename to `vendorId` is non-additive — see Known Operational Caveats.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `accountId` | UUID | FK → `Account.id` (ON DELETE **CASCADE**) |
| `date` | date | |
| `amount` | decimal(14,2) | SIGNED — negative = debit, positive = credit |
| `description` | string | |
| `categoryId` | UUID? | FK → `Category.id` (ON DELETE **RESTRICT**) — Phase B |
| `vendorId` | UUID? | FK → `Vendor.id` (ON DELETE **SET NULL**) — renamed from `vendorCustomerId` in Phase B |
| `ruleId` | UUID? | FK → `Rule.id` (ON DELETE **SET NULL**) — the rule that last categorised this row |
| `categorisedAt` | datetime? | stamped when categoryId is first set or changed by the engine |
| `notes` | string? | |
| `paymentReviewDismissedAt` | datetime? | **(Phase D)** Set by the "Not a customer payment" button on the Payments queue. Excludes the row from the default payment-review list; cleared by the Undismiss action. |
| `importHash` | string | dedupe key — sha256 of `date\|amount.toFixed(2)\|normaliseDesc(description)` |
| `importId` | UUID? | FK → `TransactionImport.id` (ON DELETE **SET NULL**) |
| `createdAt` / `updatedAt` | datetime | |

Indexes / unique constraints:
- `@@unique([accountId, importHash])` — prevents duplicate import rows per account.
- `@@index([accountId, date])` — primary query pattern for account transaction lists.
- `@@index([date])` — supports global date-range filters.

Inverse relations added in Phase B: `splits TransactionSplit[]`, `events CategorisationEvent[]`. Phase D adds `allocations Allocation[]`.

---

### TransactionImport
Audit record for every CSV import attempt — created even on zero-import or all-failed outcomes. `reportJson` holds the full `ImportReport` shape consumed by `<ImportReportPopup>`.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `accountId` | UUID | FK → `Account.id` (ON DELETE **CASCADE**) |
| `filename` | string | |
| `fileSize` | int | bytes |
| `fileSha256` | string | |
| `importedAt` | datetime | default `now()` |
| `mappingJson` | Json | CSV column → field mapping chosen at import time |
| `rowsTotal` | int | |
| `rowsImported` | int | |
| `rowsSkippedDup` | int | rows skipped because `(accountId, importHash)` already existed |
| `rowsFailed` | int | |
| `reportJson` | Json | full `ImportReport` for display in `<ImportReportPopup>` |

Relations: `transactions Transaction[]`.

---

## Relationship diagram (text)

```
BillingCompany ─┬─< Customer ─< Invoice >─ InvoiceItem >─ Item
                │                ▲                          ▲
                └─< Invoice ─────┘                          │
                                                            │
RecurringSchedule ─< RecurringRule >─ Customer              │
                     RecurringRule >─ BillingCompany        │
                     RecurringRule ─< Invoice               │
                     RecurringRule ─< RecurringRuleLineItem ┘

InvoiceTemplate ─< BillingCompany
InvoiceTemplate ─< Invoice
EmailTemplate   ─< BillingCompany
EmailTemplate   ─< Invoice

User ─< Task
User ─< TelegramChat

AccountType ─< Account ─< Transaction ─< TransactionSplit
             Account   ─< TransactionImport ─< Transaction
             Transaction ─< CategorisationEvent

Category ─< Transaction
Category ─< TransactionSplit
Category ─< Rule

Vendor ─< Transaction
Vendor ─< Rule

Rule ─< RuleCondition
Rule ─< Transaction
Rule ─< CategorisationEvent

(TaxType, Preferences, MailConfiguration, TelegramAllowlist are standalone —
no FKs to or from other tables.)
```

Edge labels:
- `>─` = many-to-one (the side with `>` is the "many")
- `─<` = one-to-many (the side with `<` is the "many")
- Most FKs use `ON DELETE SET NULL`. Exceptions: `InvoiceItem.invoiceId`, `RecurringRuleLineItem.recurringRuleId`, `RuleCondition.ruleId`, `TransactionSplit.transactionId`, and `CategorisationEvent.transactionId` are `ON DELETE CASCADE`; the four template FKs (`BillingCompany.invoiceTemplateId`, `BillingCompany.emailTemplateId`, `Invoice.invoiceTemplateId`, `Invoice.emailTemplateId`), `Account.accountTypeId`, `Transaction.categoryId`, `TransactionSplit.categoryId`, and `Rule.categoryId` are `ON DELETE RESTRICT` — a referenced row cannot be deleted while in use. Banking cascade: deleting an `Account` cascades to its `Transaction` and `TransactionImport` rows; deleting a `TransactionImport` sets `Transaction.importId` to NULL (preserving the transaction).

---

## Banking — Phase B

### Category
Lookup catalog for transaction categories. Seeded with 15 rows. Self-referential — a category may optionally have a `parentId` pointing at another `Category` row (one level of nesting only).

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | Not globally unique. Per-parent uniqueness (case-insensitive) is enforced in `CategoriesService` (mirrors the `Account` pattern from commit `602aa83`). |
| `kind` | enum `CategoryKind` | `INCOME`, `EXPENSE`, `TRANSFER`, `OTHER`. Subcategories must match their parent's kind (service-enforced). |
| `isActive` | bool | default `true` |
| `sortOrder` | int | default `100`; controls dropdown ordering (lower = first) |
| `parentId` | UUID? | nullable, FK → `Category.id` (ON DELETE **RESTRICT**). `null` for top-level rows. A row with `parentId` set is a leaf "subcategory"; a row with at least one child is a "group" and cannot itself carry transactions. |
| `createdAt` / `updatedAt` | datetime | |

Indexes: `@@index([parentId])`.

Relations: `transactions Transaction[]`, `splits TransactionSplit[]`, `rules Rule[]`, `parent Category?` (self), `children Category[]` (self).

Server rules:
- Name uniqueness is **per-parent, case-insensitive** — the previous global `@unique` on `name` was removed. `Fees` may exist as a child under both `Banking` and `Education`.
- Two-level cap: setting `parentId` on a row that already has children is rejected (`CategoriesService.assertParentValid`). Subcategories cannot themselves have subcategories.
- Assigning a group (a category with ≥1 child) as a transaction's `categoryId` is rejected by `TransactionsService.setCategory` — groups are pure rollup nodes.
- Delete blocked with 409 if any `Transaction`, `TransactionSplit`, or `Rule` references the row (FK `RESTRICT`), and additionally if `children.count > 0` (reparent or delete children first).
- `POST /categories/:id/split` converts a leaf with transactions into a group by auto-creating `"<Parent> (general)"` as the first child and reassigning all transactions to it inside one Prisma transaction. Idempotent — a no-op on rows that already have children.

---

### Vendor
Lookup catalog for payees / merchants. Seeded with 39 rows.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | UNIQUE |
| `kind` | enum `VendorKind` | `VENDOR_MATCH` |
| `aliases` | string[] | lowercase substrings; matching is case-insensitive whitespace-collapsed |
| `notes` | string? | |
| `customerId` | UUID? | **(Phase D)** FK → `Customer.id` (ON DELETE **SET NULL**). Optional link between a vendor and an invoiced customer. When set, the Payments queue can auto-fetch candidate invoices for the customer without an explicit picker step. |
| `isActive` | bool | default `true` |
| `createdAt` / `updatedAt` | datetime | |

Relations: `transactions Transaction[]`, `rules Rule[]`, `customer Customer?` (Phase D).

---

### Rule
Categorisation rule. Evaluated priority-order (lower INT = higher precedence).

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | |
| `state` | enum `RuleState` | default `USER` |
| `isActive` | bool | default `true` |
| `priority` | int | default `1000`; spaced by 10 in practice |
| `categoryId` | UUID | FK → `Category.id` (ON DELETE **RESTRICT**) |
| `vendorId` | UUID? | FK → `Vendor.id` (ON DELETE **SET NULL**) — optional; applied to matched transactions |
| `noteOnApply` | string? | text appended to `Transaction.notes` when the rule fires |
| `hitCount` | int | default `0`; incremented by the engine on each pass |
| `lastFiredAt` | datetime? | stamped by the engine on each pass |
| `createdAt` / `updatedAt` | datetime | |

Indexes: `@@index([priority])`, `@@index([state, isActive])`.

Relations: `conditions RuleCondition[]`, `transactions Transaction[]`, `events CategorisationEvent[]`.

---

### RuleCondition
One condition in a rule's AND-chain.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `ruleId` | UUID | FK → `Rule.id` (ON DELETE **CASCADE**) |
| `field` | enum `RuleField` | the transaction field to test |
| `operator` | enum `RuleOperator` | comparison operator |
| `value` | string | primary comparison value |
| `value2` | string? | upper bound for `BETWEEN` operator |
| `valueList` | string[] | values for `IN_LIST` operator |
| `position` | int | default `0`; display order within the rule |

Index: `@@index([ruleId])`.

---

### TransactionSplit
Splits a transaction across multiple categories. A transaction has either `categoryId` set (single-category) OR 1+ splits — never both. `SUM(split.amount)` must equal `Transaction.amount` (server-enforced).

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `transactionId` | UUID | FK → `Transaction.id` (ON DELETE **CASCADE**) |
| `categoryId` | UUID | FK → `Category.id` (ON DELETE **RESTRICT**) |
| `amount` | decimal(14,2) | the portion of the transaction assigned to this category |
| `notes` | string? | |
| `position` | int | default `0`; display order |

Index: `@@index([transactionId])`.

---

### CategorisationEvent
Append-only audit log. One row per change to a transaction's category, vendor, or accepted AI suggestion. Never updated after insert.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `transactionId` | UUID | FK → `Transaction.id` (ON DELETE **CASCADE**) |
| `source` | enum `EventSource` | `MANUAL`, `RULE`, `VENDOR_MATCH`, `AI_DRAFT`, `AI_APPLIED`, `AI_REJECTED` |
| `ruleId` | UUID? | FK → `Rule.id` (ON DELETE **SET NULL**) — set when `source = RULE` |
| `oldCategoryId` | UUID? | category before the change |
| `newCategoryId` | UUID? | category after the change |
| `oldVendorId` | UUID? | vendor before the change |
| `newVendorId` | UUID? | vendor after the change |
| `acceptedAiSuggestion` | bool? | set when `source = AI_SUGGESTION`; Phase C reads these rows as few-shot examples |
| `providerId` | UUID? | FK → `AiProvider.id` (ON DELETE **SET NULL**). Set on `AI_DRAFT` / `AI_APPLIED` / `AI_REJECTED` events to record which provider produced the suggestion. Null on USER / RULE / VENDOR_MATCH events, and on AI events that pre-date this column (no backfill). Deleting a provider preserves the audit row, just loses the link. |
| `createdAt` | datetime | default `now()` — no `updatedAt`; rows are immutable |

Indexes: `@@index([transactionId])`, `@@index([source, createdAt])`, `@@index([ruleId])`, `@@index([providerId])`.

---

## AI

### AiProvider
Configuration record for an external LLM provider.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | |
| `model` | string | e.g. "gpt-4o" |
| `apiBaseUrl` | string | |
| `apiKey` | string | **Stored as plain text — same boilerplate trade-off as `MailConfiguration.password` and `BillingCompany.customSmtpPassword`. Revisit before production.** |
| `isPrimary` | bool | default `false`. At most one row has `isPrimary=true` at any time; enforced by the service. |
| `isEnabled` | bool | default `true`. Filters at the chain level — `AiClientService.complete()` calls `findMany({ where: { isEnabled: true }, ... })`. Disabled providers are skipped entirely (don't fire, don't count as failed attempts, don't appear in `AiCall` logs). Independent of `isPrimary`. |
| `sortOrder` | int | default `1000`. **(Phase C)** Consulted only for `isPrimary=false` rows — lower value = tried earlier in the provider chain. |
| `requestsPerMinute` | int | default `15`. Per-provider self-pacing ceiling enforced by `AiClientService`. Tier hints surfaced in the UI: `~15 free, ~60 paid lite, ~1000 paid`. Range 1–10000. |
| `createdAt` / `updatedAt` | datetime | |

Indexes: `@@index([isPrimary, sortOrder])` (Phase C).

Server rules:
- Setting any provider as primary atomically unsets `isPrimary` on all others.
- Deleting the current primary auto-promotes the oldest remaining provider (by `createdAt` asc) as the new primary.
- `isEnabled` is independent of `isPrimary`. If the only enabled provider is non-primary, the chain still works. If **all** enabled providers are disabled (or none exist), `complete()` returns `{ ok: false, error: 'no-providers' }`.

---

## Phase C additions

All Phase C schema changes are **fully additive**. `prisma db push` applies them without data loss and without requiring `docker compose down -v`.

### New enum values

| Enum | New value(s) |
|---|---|
| `EventSource` | `AI_REJECTED` — written when a user explicitly rejects an AI suggestion |
| `AiCallPurpose` *(new enum)* | `CATEGORISE`, `DRAFT_RULE` |
| `AiCallStatus` *(new enum)* | `OK`, `FAILED` |

### New column — `Rule.clusterHash`

| Column | Type | Notes |
|---|---|---|
| `clusterHash` | string? | `sha256(clusterKey|categoryId).slice(0,16)`. Set on AI_DRAFTED / APPROVED / DENIED rules. Used for mining suppression — prevents the same intent being re-mined after approval or denial. |

Index: `@@index([clusterHash])`.

### New column — `CategorisationEvent.reasoning`

| Column | Type | Notes |
|---|---|---|
| `reasoning` | string? | AI's free-text justification (≤ 200 chars). Populated for `AI_DRAFT`, `AI_APPLIED`, and `AI_REJECTED` events. Null for USER / RULE / VENDOR_MATCH. |

### New column — `Preferences.aiMiningThreshold`

| Column | Type | Notes |
|---|---|---|
| `aiMiningThreshold` | int | default `3`. Minimum cluster size before AI proposes a draft rule. Configurable via `/settings/ai-setup`. |

### New table — `AiCall`

One row per HTTP attempt to an LLM provider. Provides full observability of the provider chain — a primary-fail → backup1-OK sequence writes two rows.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `providerId` | UUID | FK → `AiProvider.id` (ON DELETE **CASCADE**) |
| `purpose` | enum `AiCallPurpose` | `CATEGORISE` or `DRAFT_RULE` |
| `promptTokens` | int? | null on failure or when provider omits usage |
| `completionTokens` | int? | null on failure or when provider omits usage |
| `latencyMs` | int | wall-clock ms from request start to response end |
| `status` | enum `AiCallStatus` | `OK` or `FAILED` |
| `httpStatus` | int? | null on network failure (no response received) |
| `errorMessage` | string? | populated on `FAILED` rows |
| `transactionId` | string? | set when `purpose = CATEGORISE` |
| `ruleId` | string? | set when `purpose = DRAFT_RULE` (back-filled after the rule row is created) |
| `createdAt` | datetime | default `now()` — no `updatedAt`; rows are immutable |

Indexes: `@@index([providerId, createdAt])`, `@@index([status, createdAt])`, `@@index([transactionId])`.

Note: `AiCall` rows accumulate without a retention policy. A future cleanup job is planned; until then, manual pruning via `DELETE FROM "AiCall" WHERE "createdAt" < NOW() - INTERVAL '30 days'` is sufficient.

---

## Phase D — Invoice payment matching

All Phase D schema changes are **fully additive**. `prisma db push` applies them without data loss and without requiring `docker compose down -v`.

### Allocation

Maps a portion of one `Transaction.amount` onto one `Invoice`. A transaction may have many allocations (split a single deposit across several invoices); an invoice may have many allocations (paid in instalments).

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `transactionId` | UUID | FK → `Transaction.id` (ON DELETE **CASCADE**) |
| `invoiceId` | UUID | FK → `Invoice.id` (ON DELETE **RESTRICT**) — invoices with allocations cannot be deleted |
| `amount` | decimal(14,2) | the portion of the transaction allocated to this invoice |
| `createdAt` | datetime | default `now()` |

Indexes: `@@index([transactionId])`, `@@index([invoiceId])`.

Server rules:
- `Invoice.amountPaid` / `amountOutstanding` are recomputed by `recomputeInvoicePayment` inside the same transaction as every allocation create or delete.
- Sum of allocations against a single transaction may not exceed `|Transaction.amount|`. Sum of allocations against a single invoice may not exceed `Invoice.totalAmount`.

---

### AllocationEvent

Append-only audit log. One row per allocation create or delete. Rows are never updated after insert.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `eventType` | enum `AllocationEventType` | `CREATED` or `DELETED` |
| `transactionId` | string | **Plain string snapshot, NOT a FK.** Audit rows survive deletes of the underlying transaction. |
| `invoiceId` | string | **Plain string snapshot, NOT a FK.** Audit rows survive deletes of the underlying invoice. |
| `amount` | decimal(14,2) | the allocation amount as it was at the time of the event |
| `invoiceStatusBefore` | enum `InvoiceStatus` | invoice status before the change |
| `invoiceStatusAfter` | enum `InvoiceStatus` | invoice status after the change |
| `source` | enum `AllocationEventSource` | `USER` (only value today) |
| `createdAt` | datetime | default `now()` — no `updatedAt`; rows are immutable |

Indexes: `@@index([transactionId])`, `@@index([invoiceId])`, `@@index([createdAt])`.

---

### Relationship diagram additions

```
Transaction ─< Allocation >─ Invoice
              (AllocationEvent — string snapshots only, no FKs)

Vendor >─ Customer (optional, ON DELETE SET NULL)
```
