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
| `EventSource` | `MANUAL`, `RULE`, `AI_SUGGESTION`, `IMPORT` — records what triggered a `CategorisationEvent` |

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
| `createdAt` / `updatedAt` | datetime | |

Relations: `customer`, `billingCompany`, `recurringRule`, `lineItems InvoiceItem[]`, `invoiceTemplate InvoiceTemplate?`, `emailTemplate EmailTemplate?`.

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
| `name` | string | |
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
A single bank-statement line. `amount` is SIGNED (negative = debit, positive = credit). `runningBalance` is the bank-supplied figure when the CSV exposes it; nullable so formats without a balance column still fit.

Phase B promoted several forward-compat columns to real FKs and added new columns. The `vendorCustomerId` rename to `vendorId` is non-additive — see Known Operational Caveats.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `accountId` | UUID | FK → `Account.id` (ON DELETE **CASCADE**) |
| `date` | date | |
| `amount` | decimal(14,2) | SIGNED — negative = debit, positive = credit |
| `description` | string | |
| `runningBalance` | decimal(14,2)? | bank-supplied; nullable |
| `categoryId` | UUID? | FK → `Category.id` (ON DELETE **RESTRICT**) — Phase B |
| `vendorId` | UUID? | FK → `Vendor.id` (ON DELETE **SET NULL**) — renamed from `vendorCustomerId` in Phase B |
| `ruleId` | UUID? | FK → `Rule.id` (ON DELETE **SET NULL**) — the rule that last categorised this row |
| `categorisedAt` | datetime? | stamped when categoryId is first set or changed by the engine |
| `notes` | string? | |
| `importHash` | string | dedupe key — sha256 of `date\|amount.toFixed(2)\|normaliseDesc(description)\|runningBalance` |
| `importId` | UUID? | FK → `TransactionImport.id` (ON DELETE **SET NULL**) |
| `createdAt` / `updatedAt` | datetime | |

Indexes / unique constraints:
- `@@unique([accountId, importHash])` — prevents duplicate import rows per account.
- `@@index([accountId, date])` — primary query pattern for account transaction lists.
- `@@index([date])` — supports global date-range filters.

Inverse relations added in Phase B: `splits TransactionSplit[]`, `events CategorisationEvent[]`.

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
Lookup catalog for transaction categories. Seeded with 15 rows.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | UNIQUE |
| `kind` | enum `CategoryKind` | `INCOME`, `EXPENSE`, `TRANSFER`, `OTHER` |
| `isActive` | bool | default `true` |
| `sortOrder` | int | default `100`; controls dropdown ordering (lower = first) |
| `createdAt` / `updatedAt` | datetime | |

Relations: `transactions Transaction[]`, `splits TransactionSplit[]`, `rules Rule[]`.

Delete blocked with 409 if any `Transaction`, `TransactionSplit`, or `Rule` references the row (FK `RESTRICT`).

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
| `isActive` | bool | default `true` |
| `createdAt` / `updatedAt` | datetime | |

Relations: `transactions Transaction[]`, `rules Rule[]`.

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
| `source` | enum `EventSource` | `MANUAL`, `RULE`, `AI_SUGGESTION`, `IMPORT` |
| `ruleId` | UUID? | FK → `Rule.id` (ON DELETE **SET NULL**) — set when `source = RULE` |
| `oldCategoryId` | UUID? | category before the change |
| `newCategoryId` | UUID? | category after the change |
| `oldVendorId` | UUID? | vendor before the change |
| `newVendorId` | UUID? | vendor after the change |
| `acceptedAiSuggestion` | bool? | set when `source = AI_SUGGESTION`; Phase C reads these rows as few-shot examples |
| `createdAt` | datetime | default `now()` — no `updatedAt`; rows are immutable |

Indexes: `@@index([transactionId])`, `@@index([source, createdAt])`, `@@index([ruleId])`.

---

## AI

### AiProvider
Configuration record for an external LLM provider. Phase C scaffolding — no LLM is called anywhere yet. This table persists provider config that Phase C will read.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | |
| `model` | string | e.g. "gpt-4o" |
| `apiBaseUrl` | string | |
| `apiKey` | string | **Stored as plain text — same boilerplate trade-off as `MailConfiguration.password` and `BillingCompany.customSmtpPassword`. Revisit before production.** |
| `isPrimary` | bool | default `false`. At most one row has `isPrimary=true` at any time; enforced by the service. |
| `createdAt` / `updatedAt` | datetime | |

Server rules:
- Setting any provider as primary atomically unsets `isPrimary` on all others.
- Deleting the current primary auto-promotes the oldest remaining provider (by `createdAt` asc) as the new primary.
