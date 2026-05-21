# Banking Module — Phase A Design

**Status:** approved (2026-05-21)
**Scope:** Phase A of the Banking module: accounts CRUD, transactions table with multi-account/date filtering and server-side sort+pagination, CSV import for two Australian bank formats with duplicate detection, and persisted import-report logs under Settings.
**Out of scope (deferred):** Rules engine (Phase B), AI-assisted categorisation (Phase C), personal-finance dashboard (Phase D). See "Out of scope" at the end.

---

## 1. Decisions captured

Each decision is the user's selection from the brainstorming Q&A.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| Q1 | Account types | **Lookup table** (`AccountType` model). Seeded with: Everyday, Savings, Credit Card, Loan, Cash, Offset. | Editable in Settings; matches `TaxType` pattern. |
| Q2 | Bank-supplied running balance | **Store on each transaction** (nullable) **and** compute our own. Mismatches surface as warnings in the `ImportReport.warnings[]` array (per-row), so they are visible in the post-import popup AND in the persisted log page. | Free reconciliation oracle for one nullable column. |
| Q3 | Duplicate detection | **Stable `importHash` per row + UNIQUE per `(accountId, importHash)`.** Hash inputs: `date | signedAmount | normaliseDesc(description) | runningBalance ?? ''`. Skipped duplicates are reported, never imported. | DB-level enforcement; works whether or not `runningBalance` is present. |
| Q4 | Navigation between Accounts/Transactions | **One transactions-table component, two routes:** `/transactions` (global, multi-account filter visible) and `/accounts/[id]` (pre-filtered + account header + Import CSV button). | Matches "clicking an account shows transactions" wording; gives import an obvious home. |
| Q5 | CSV column mapping | **Auto-detect then confirm.** Sniff returns suggested mapping + first 5 rows; modal shows dropdowns the user can override before commit. Schema is mapping-driven so saved-profiles-per-account is a cheap additive change later. | Xero/QuickBooks pattern; safe against silent mis-detection on headerless CSVs. |
| Q6 | Account deletion with transactions | **Soft-delete only** (`isActive` flag). No hard-delete affordance; direct SQL remains the escape hatch. | Matches existing schema pattern across Customer/BillingCompany/Item/TaxType. |

Architecture: **Approach 2** — separate `accounts`, `transactions`, `transaction-imports`, `import-logs` NestJS modules; synchronous import. Upload cap **10 MB**.

Assumed defaults (no question raised, locked unless flagged later):
- Currency: AUD only. No `currency` column.
- Date storage: `@db.Date` (no time), serialized as `YYYY-MM-DD`.
- Decimals: `Decimal(14, 2)` for account/transaction money (vs `Decimal(12, 2)` on Invoice — see §3 for why).
- Phase B forward-compat: `Transaction.categoryId / vendorCustomerId / notes` scaffolded nullable now, populated by Phase B.

---

## 2. Architecture overview

```
Browser
  └─ Next.js (frontend)
       ├─ /accounts            ── accounts list (CRUD)
       ├─ /accounts/new        ── create form
       ├─ /accounts/[id]       ── header card + transactions table for one account + Import CSV
       ├─ /accounts/[id]/edit  ── edit form
       ├─ /transactions        ── global multi-account transactions table
       └─ /settings/import-logs[/:id]  ── persisted import reports

NestJS backend modules
  ├─ accounts/                  ── Account + AccountType CRUD
  ├─ transactions/              ── server-side filtered/sorted/paginated read
  ├─ transaction-imports/       ── sniff → confirm → commit; parser + sniffer services
  └─ import-logs/               ── read-only access to historical TransactionImport rows

PostgreSQL
  └─ 4 new tables: AccountType, Account, Transaction, TransactionImport
```

No new external services, no new env vars, no BullMQ work, no new Docker services. New backend dependency: `papaparse`. No new frontend dependencies.

---

## 3. Data model (Prisma)

All additive; safe for `prisma db push`.

```prisma
// Lookup table. Seeded with: Everyday, Savings, Credit Card, Loan, Cash, Offset.
model AccountType {
  id        String   @id @default(uuid())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  accounts  Account[]
}

model Account {
  id              String      @id @default(uuid())
  name            String                                  // user label, e.g. "CBA Smart Access"
  bank            String                                  // free text: "Commonwealth Bank"
  accountNumber   String?                                 // optional, free text
  accountTypeId   String
  accountType     AccountType @relation(fields: [accountTypeId], references: [id], onDelete: Restrict)
  openingBalance  Decimal     @db.Decimal(14, 2) @default(0)
  openingDate     DateTime    @db.Date
  notes           String?
  isActive        Boolean     @default(true)              // soft-delete
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  transactions    Transaction[]
  imports         TransactionImport[]
}

model Transaction {
  id              String   @id @default(uuid())
  accountId       String
  account         Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  date            DateTime @db.Date
  amount          Decimal  @db.Decimal(14, 2)             // SIGNED: negative=debit, positive=credit
  description     String
  runningBalance  Decimal? @db.Decimal(14, 2)             // bank-supplied; nullable

  // Phase-B forward-compat. Populated by Phase B; Phase A neither reads nor writes.
  categoryId        String?
  vendorCustomerId  String?
  notes             String?

  importHash      String                                  // sha256, see §6
  importId        String?
  import          TransactionImport? @relation(fields: [importId], references: [id], onDelete: SetNull)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([accountId, importHash])
  @@index([accountId, date])
  @@index([date])
}

model TransactionImport {
  id             String   @id @default(uuid())
  accountId      String
  account        Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  filename       String
  fileSize       Int
  fileSha256     String                                  // detects "this exact file already imported"
  importedAt     DateTime @default(now())

  mappingJson    Json                                    // ColumnMapping (see §6)
  rowsTotal      Int
  rowsImported   Int
  rowsSkippedDup Int
  rowsFailed     Int
  reportJson     Json                                    // full ImportReport (see §6)

  transactions   Transaction[]
}
```

**Notes:**
- `Decimal(14, 2)` (vs invoices' `(12, 2)`) — account balances accumulated over years can exceed the 10-digit-integer cap of `(12, 2)`. Transactions follow account for consistency. Documented in `DatabaseSchema.md`.
- `onDelete: Cascade` on `Transaction.accountId` and `TransactionImport.accountId` is harmless because soft-delete is the user-facing path. Cascade only fires on direct SQL `DELETE`.
- `onDelete: Restrict` on `Account.accountTypeId` — mirrors `BillingCompany → InvoiceTemplate`. 409 if the user tries to delete an in-use type.
- `@@unique([accountId, importHash])` is the dedup mechanism; `createMany({ skipDuplicates: true })` uses it.

---

## 4. Backend module layout

```
backend/src/
├── accounts/
│   ├── accounts.module.ts
│   ├── accounts.controller.ts
│   ├── accounts.service.ts
│   ├── account-types.controller.ts          // CRUD for AccountType lookup
│   └── dto/{create-account,update-account}.dto.ts
│
├── transactions/
│   ├── transactions.module.ts
│   ├── transactions.controller.ts
│   ├── transactions.service.ts
│   └── dto/list-transactions.dto.ts         // accountIds[], dateFrom, dateTo, sortBy, sortDir, page, pageSize
│
├── transaction-imports/
│   ├── transaction-imports.module.ts
│   ├── transaction-imports.controller.ts
│   ├── transaction-imports.service.ts       // orchestrates sniff + commit
│   ├── csv-parser.service.ts                // pure: (buffer, mapping) → ParseResult
│   ├── csv-sniffer.service.ts               // heuristics → MappingSuggestion
│   ├── dto/{sniff-csv,commit-import}.dto.ts
│   └── types/{mapping,report}.ts
│
└── import-logs/
    ├── import-logs.module.ts
    ├── import-logs.controller.ts            // read-only
    └── import-logs.service.ts
```

### Endpoints

```
# Accounts
GET    /accounts                                  list (?includeInactive=true to show archived)
POST   /accounts                                  create
GET    /accounts/:id                              detail incl. computed currentBalance
                                                  currentBalance = openingBalance + SUM(transactions.amount)
                                                  computed via Prisma aggregate in one query
PATCH  /accounts/:id                              update
PATCH  /accounts/:id/archive                      sets isActive=false
PATCH  /accounts/:id/restore                      sets isActive=true

# Account types (lookup CRUD)
GET    /account-types
POST   /account-types
PATCH  /account-types/:id
DELETE /account-types/:id                         409 via FK Restrict if in use

# Transactions (cross-account; per-account is just accountIds=[one])
GET    /transactions?accountIds=&dateFrom=&dateTo=&sortBy=date&sortDir=desc&page=1&pageSize=200
       → { items: Transaction[], totalCount: number }

# CSV import — sniff → commit
POST   /transaction-imports/sniff                 multipart file ≤ 10 MB
       → { previewRows: string[][5], suggestedMapping: MappingSuggestion, fileSha256: string,
           alreadyImportedAs?: string }
POST   /transaction-imports/commit                multipart: file (≤ 10 MB) + JSON fields:
                                                  accountId, fileSha256, mapping (JSON-stringified)
       → ImportReport (sync; same shape persisted in reportJson)
       Note: /commit is multipart (not application/json with fileBase64) so the 10 MB cap is
       enforced consistently via FileInterceptor; NestJS's default JSON body limit (100 KB)
       would otherwise 413 a base64-encoded 10 MB file before the controller runs.

# Import logs
GET    /import-logs?accountId=&dateFrom=&dateTo=&page=&pageSize=
       → { items: <TransactionImport without reportJson>, totalCount }
GET    /import-logs/:id
       → TransactionImport WITH reportJson populated
```

The 10 MB cap is enforced at the controller layer via `FileInterceptor` with `limits: { fileSize: 10 * 1024 * 1024 }` — request 413s before hitting parser code.

---

## 5. CSV parser + sniffer contract

### Types

```ts
type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

type ColumnRole =
  | "date" | "description" | "amount"
  | "debit" | "credit" | "balance" | "ignore";

type ColumnMapping = {
  hasHeader: boolean;
  dateFormat: DateFormat;
  columns: ColumnRole[];               // one role per CSV column, by index
};

type ParsedRow = {
  date: string;                        // YYYY-MM-DD, local calendar
  amount: string;                      // signed decimal as string, e.g. "-1750.00"
  description: string;
  runningBalance: string | null;
};

type ParseError = { rowIndex: number; reason: string; raw: string[] };
type ParseResult = { rows: ParsedRow[]; parseErrors: ParseError[] };

type MappingSuggestion = {
  mapping: ColumnMapping;
  confidence: "high" | "medium" | "low";
  reasoning: string[];                 // human-readable e.g. "Col 0 parses as DD/MM/YYYY in 100% of rows"
};
```

### Parser rules (`csv-parser.service.ts`)

Pure function: `parseCsv(buffer: Buffer, mapping: ColumnMapping): ParseResult`.

- Uses `papaparse` with `{ skipEmptyLines: true }`. Strips a header row if `mapping.hasHeader === true`.
- **Mapping validation** (throws 422 if invalid): must be either
  - **Style A** — exactly one `amount` column, zero `debit` and zero `credit` columns; OR
  - **Style B** — exactly one `debit` and one `credit` column, zero `amount` columns.
  - At least one `date`, one `description`. At most one `balance`. All other columns must be `ignore`.
- **Date parsing** is explicit from `dateFormat` — never `new Date(string)` (per CLAUDE.md gotcha). Builds `YYYY-MM-DD` from the captured parts. Rows whose date fails to parse become `ParseError`, not `ParsedRow`.
- **Amount handling:**
  - Style A: strip leading `+`, strip wrapping quotes, parse as `Decimal`. Sign comes from the file.
  - Style B: parse `debit` and `credit` independently (empty string → `0`); store `(credit) - (debit)` as `amount`.
- **Description** stored verbatim from the file (after CSV unquoting).
- **Running balance** parsed the same way as Style A amount; if no `balance` column in mapping → `null`.

### Sniffer rules (`csv-sniffer.service.ts`)

Per column, the sniffer scores:
- `dateScore`: fraction of values that parse as a date in either `DD/MM/YYYY` or `MM/DD/YYYY` (pick the higher; ISO is also checked).
- `amountScore`: fraction of values that parse as a signed decimal (allowing leading `+` and surrounding quotes).
- `balanceScore`: `amountScore` AND values are monotonically changing across rows (with allowance for unsorted input — checked on sort-by-date).
- `textScore`: fraction of values that contain at least one alphabetic character.

Picks the highest-scoring column for each role: date, amount (or debit+credit if no single signed column dominates), description (highest `textScore` after date is assigned), balance (best `balanceScore` if any column scores > 0.8). Returns `confidence: "high"` if every assignment scored ≥ 0.9; `"medium"` if any role was ≥ 0.6; `"low"` otherwise.

`hasHeader = true` if row 0 contains zero parseable dates/decimals across the columns that the rest of the file parses successfully against.

**Expected sniff on the attached samples:** `hasHeader: false`, `dateFormat: "DD/MM/YYYY"`, `columns: ["date", "amount", "description", "balance"]`, `confidence: "high"`.

---

## 6. Import flow + report shape

### Sniff → confirm → commit (sync)

```
1. Client → POST /transaction-imports/sniff (multipart file).
2. Server reads file (≤ 10 MB), computes fileSha256, runs csv-parser with a "tentative no-op mapping"
   just to get the raw matrix, then runs csv-sniffer over the matrix. If a prior TransactionImport
   on this account has the same fileSha256, attach alreadyImportedAs: <importId> to the response.
3. Server returns { previewRows: matrix.slice(0, 5), suggestedMapping, fileSha256, alreadyImportedAs? }.
4. Client renders the mapping-confirmation modal with the suggestion pre-selected.
5. User confirms → Client → POST /transaction-imports/commit (multipart):
                     file (re-uploaded) + accountId + fileSha256 + mapping (JSON string).
6. Server commit flow:
   a. FileInterceptor enforces ≤ 10 MB; service re-hashes to confirm fileSha256 matches what /sniff
      returned (anti bait-and-switch).
   b. parseCsv(buffer, mapping) → { rows, parseErrors }.
   c. For each row compute importHash = sha256(date | amount.toFixed(2) | normaliseDesc(description)
      | runningBalance?.toFixed(2) ?? '').
   d. Running-balance reconciliation (intra-file): for each consecutive pair of rows (sorted by
      date asc, then file order) where BOTH have a non-null bank runningBalance, verify
      `B_curr = B_prev + amount_curr`. Each violation appends a warning to ImportReport:
      "Rows N-1→N (DD/MM/YYYY): balance jump $Z does not match transaction amount $A". This is a
      self-consistency check on the bank's own data — independent of openingBalance, so a partial
      mid-period import still gets a useful reconciliation report.
   e. Begin prisma.$transaction:
      - Create TransactionImport row (placeholder counts).
      - transactions.createMany({ data: rows-with-importId, skipDuplicates: true }).
      - Diff input rows vs inserted rows by importHash to compute duplicateRows[]
        (each duplicate is also resolved to its existing transactionId via a single SELECT).
      - Compose full ImportReport (including the reconciliation warnings from step d).
      - Update TransactionImport counters + reportJson.
   f. Return ImportReport.
7. Client swaps the dialog body to <ImportReportPopup data={report} />.
```

`normaliseDesc`:
```ts
const normaliseDesc = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
```

Storage keeps the original `description` verbatim. The hash sees the normalised form.

### `ImportReport` shape (returned from `/commit`, stored in `TransactionImport.reportJson`)

```ts
type ImportReport = {
  importId: string;
  accountId: string;
  accountName: string;
  filename: string;
  fileSize: number;
  fileSha256: string;
  importedAt: string;                          // ISO timestamp
  mapping: ColumnMapping;
  counts: {
    total: number;
    imported: number;
    duplicates: number;
    failed: number;
  };
  imported:   Array<{ date: string; amount: string; description: string }>;
  duplicates: Array<{ date: string; amount: string; description: string;
                      existingTransactionId: string }>;
  failed:     Array<{ rowIndex: number; reason: string; raw: string[] }>;
  warnings:   string[];                        // e.g. "This exact file was already imported on …"
};
```

The popup and the persisted log page **render off this same shape** via the shared `<ImportReportPopup>` component.

### Failure modes

| Condition | Response |
|---|---|
| Upload > 10 MB | 413 from `FileInterceptor` before parsing. |
| File unparseable as CSV | 422 from `/sniff`. |
| Mapping violates Style-A-or-B rule | 422 from `/commit` with field-level message. |
| Zero data rows after parsing | 200 with `ImportReport` zeros + warning. Row still saved. |
| DB error during commit | `$transaction` rolls back; no import row written; 500 to caller. |

---

## 7. Frontend routes + components

### Routes (under `frontend/app/`)

```
/accounts                                  list (replaces ComingSoon stub)
/accounts/new                              create form
/accounts/[id]                             header + transactions table for one account
/accounts/[id]/edit                        edit form
/transactions                              global multi-account transactions table
/settings/account-types                    AccountType lookup CRUD (add/rename/deactivate)
/settings/import-logs                      persisted import reports list
/settings/import-logs/[id]                 single report (renders <ImportReportPopup> read-only)
```

### Components (under `frontend/components/`)

```
accounts/
  accounts-list.tsx              wraps <FilteredList> (in-memory; small data set)
  account-form.tsx               create+edit; wrapped in <EditPageChrome>
  account-header-card.tsx        on /accounts/[id]: name, bank, type, opening/current balance, last-import link
  account-types-manager.tsx     used in Settings (admin UI for AccountType lookup)

transactions/
  transactions-table.tsx         the workhorse — `mode: "account" | "global"`
  transactions-filter-bar.tsx    account multi-select + date pickers; uses <FilterPanel>
  transaction-amount-cell.tsx    signed amount; green-700 credit / red-700 debit

transaction-imports/
  import-csv-button.tsx          on /accounts/[id] header
  import-csv-dialog.tsx          4-step Dialog: file → confirm mapping → importing → report
  column-mapping-step.tsx        the dropdown grid + first-5-rows preview
  import-report-popup.tsx        SHARED — used by dialog step 4 AND /settings/import-logs/[id]

settings/import-logs/
  import-logs-list.tsx           list page (FilteredList)
  import-log-detail.tsx          wraps <ImportReportPopup> in EditPageChrome read-only

lib/api.ts                       extended with accounts / transactions / imports / import-logs helpers
```

### Transactions table behaviour

- Two modes via prop. `mode="account"` hides the account multi-select; `mode="global"` shows it and defaults to all active accounts.
- Columns: **Date · Description · Amount · Balance · Account** (account column only in global mode). No Category/Vendor in Phase A.
- **Server-side** sort + pagination (this is the first list in the app to do so). Filter state lives in URL: `?accountIds=…&dateFrom=…&dateTo=…&sortBy=…&sortDir=…&page=…`.
- Default sort: `date desc, id desc` (latest first; id breaks same-day ties stably).
- Every column sortable.
- Page size **200** (overriding the project default 100; documented in `DesignSystem.md`).
- Filter panel uses the existing `<FilterPanel>` chrome and tokens.

### CSV import dialog (4 steps in one `<Dialog>`)

1. **Choose file** — drag/drop or picker; client-side checks: `.csv` extension, ≤ 10 MB; POST to `/sniff`.
2. **Confirm mapping** — first-5-rows table + per-column dropdown (`Date / Description / Amount (signed) / Debit / Credit / Balance / Ignore`) + date-format selector; pre-filled from `suggestedMapping`. `alreadyImportedAs` yields a yellow banner.
3. **Importing** — generic spinner while `/commit` runs (sync; real files complete in well under a second).
4. **Report** — swaps in `<ImportReportPopup>`. Close-only; new import = re-open dialog.

### `<ImportReportPopup>` layout

Four stat cards at top (Total / Imported / Duplicates / Failed), warnings banner, then three collapsible sections (Imported collapsed by default; Duplicates and Failed expanded if non-zero). Duplicate rows link to `/accounts/<accountId>?highlight=<txnId>` for a 2-second `bg-amber-100` highlight on the existing row.

### Design-system adherence (per `DesignSystem.md`)

- Page bg `#EDEEF3`, cards `rounded-lg`, buttons/inputs `rounded-[0.3rem]`, Noto Sans.
- Lucide icons inside the new pages; Phosphor `weight="fill"` only in the sidebar.
- Sidebar already has Accounts/Transactions/Rules entries (`sidebar.tsx:51-56`) — no nav changes needed for Phase A's top-level surfaces.
- Settings sub-nav gets two new entries: *Account Types* and *Import Logs*. Pattern matched to existing settings layout at implementation time.

---

## 8. Seed data (`backend/prisma/seed.ts`)

Seed only runs when `User` is empty. Phase A adds:

- **`AccountType` lookup** — 6 rows, all `isActive=true`: Everyday, Savings, Credit Card, Loan, Cash, Offset.
- **Sample accounts** — 2 rows so empty-state isn't first impression on a fresh DB:
  - `CBA Smart Access` — Commonwealth Bank, Everyday, opening balance `0.00`, opening date = seed date.
  - `CBA Goal Saver` — Commonwealth Bank, Savings, opening balance `0.00`, opening date = seed date.
- **No seeded transactions** and no seeded `TransactionImport` rows — user populates by importing the attached CSVs.

Existing dev DBs need `docker compose down -v` or direct SQL to pick up these rows (per the seeding-on-empty-User rule in CLAUDE.md).

---

## 9. Doc updates

Required after implementation:

1. **`DatabaseSchema.md`** — new models, FK rules, the `(accountId, importHash)` unique index, the `Decimal(14, 2)` vs `(12, 2)` rationale.
2. **`Architecture.md`** — four new NestJS modules, `papaparse` dependency, 10 MB upload cap.
3. **`modules_and_logic.md`** — new sections for `accounts`, `transactions`, `import-logs`: fields, required flags, list columns, default sort, edit-page rows, and a callout that the transactions table is the first list in the app with server-side sort+filter.
4. **`DesignSystem.md`** — the 200-rows-per-page exception for transactions, signed-amount colour convention (green-700 credit / red-700 debit), and `<ImportReportPopup>` as a shared popup-and-page component.

---

## 10. Implementation order (preview)

Concrete tasks come from `writing-plans`. Rough sequence:

1. Prisma schema + `db push` + seed updates.
2. Backend modules (accounts → transactions → transaction-imports → import-logs), each with controller + service + DTOs + types.
3. Unit tests for `csv-parser.service.ts` and `csv-sniffer.service.ts` against the three attached CSVs (`1.csv`, `2.csv`, `3.csv`).
4. Frontend `lib/api.ts` extensions.
5. `/accounts` list + create + edit pages.
6. `<TransactionsTable>` + `/transactions` + `/accounts/[id]`.
7. Import dialog + `<ImportReportPopup>`.
8. `/settings/import-logs` list + detail; Settings nav entry.
9. Doc updates (the four sibling files).
10. Manual verification: import each of `1.csv`, `2.csv`, `3.csv`; verify dedup catches the overlap between `2.csv` and `3.csv` (Feb–Mar 2026 rows appear in both); verify popup and persisted log page render identically.

---

## 11. Out of scope for Phase A

Deferred to later phases; explicitly NOT to be built now:

- Manual transaction create/edit/delete (CSV import only in Phase A).
- Categories, vendors, rules (Phase B).
- Test Rules sandbox page (Phase B — dry-run rules against an uploaded CSV or existing transactions; banner makes clear nothing is mutated).
- AI provider settings + AI-drafted categorisation/rules (Phase C).
- Inter-account transfer detection/matching (later).
- Personal-finance dashboard with income/expense breakdown + 1-year default (Phase D).
- Mobile-optimised transactions table (accept horizontal scroll, matching existing project gotcha).
- Saved column-mapping profiles per account (designed for, not built now).
- BullMQ-backed async import.
- Hard-delete of accounts.
- Multi-currency.
