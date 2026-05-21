# DatabaseSchema.md

Postgres schema for SimpleBooks. Generated from [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — when the Prisma schema changes, update this file too.

For per-module *field semantics, required flags, UI surface, and business logic*, see [modules_and_logic.md](modules_and_logic.md). This file is the **data shape** reference.

## Conventions

- IDs are `UUID v4` (`@default(uuid())`) **except** `User`, `Task`, and `TelegramChat`, which use `cuid` (`@default(cuid())`) for legacy reasons.
- Money columns are `Decimal(12, 2)`. Tax rates are `Decimal(6, 3)` (percent, 0–100 with three decimal places).
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

(TaxType, Preferences, MailConfiguration, TelegramAllowlist are standalone —
no FKs to or from other tables.)
```

Edge labels:
- `>─` = many-to-one (the side with `>` is the "many")
- `─<` = one-to-many (the side with `<` is the "many")
- Most FKs use `ON DELETE SET NULL`. Exceptions: `InvoiceItem.invoiceId` and `RecurringRuleLineItem.recurringRuleId` are `ON DELETE CASCADE`; the four template FKs (`BillingCompany.invoiceTemplateId`, `BillingCompany.emailTemplateId`, `Invoice.invoiceTemplateId`, `Invoice.emailTemplateId`) are `ON DELETE RESTRICT` — a referenced template cannot be deleted.
