# Banking Module — Phase B Design

**Status:** approved (2026-05-22)
**Builds on:** [Phase A design](2026-05-21-banking-phase-a-design.md), shipped at v0.6.0.
**Scope:** Categories, Vendors, Rules engine (USER + APPROVED reachable; AI_DRAFTED + DENIED scaffolded for Phase C), two-pass categorisation engine, Test Rules sandbox, opt-in CSV-import categorisation, transaction splits, categorisation audit log (for Phase C AI learning), user manual.
**Out of scope:** AI provider settings, AI-drafted rules, AI categorisation (all Phase C). Personal-finance dashboard (Phase D). Inter-account transfer matching (later).

---

## 1. Decisions captured

| # | Decision | Choice | Rationale |
|---|---|---|---|
| Q1 | Scope | Rules engine (with all 4 states modelled) + Test Rules sandbox + opt-in "Categorise based on rules" checkbox in CSV import flow + auto-vendor-matching. Auto-apply on import is **off by default** — opt-in only. | Matches user's explicit instruction; rules are deliberate, not silent. |
| Q2 | Categories model | **Flat lookup table with `kind` enum** (`INCOME`/`EXPENSE`/`TRANSFER`/`OTHER`) + **`TransactionSplit` model** for multi-category transactions. | Flat = sum-by-kind is trivial; splits handle real-world supermarket-style purchases. |
| Q3 | Rule expression model | **AND-only**: each Rule has 1..N `RuleCondition` rows, all must match. Fields: `DESCRIPTION`, `AMOUNT`, `VENDOR`, `ACCOUNT`. Operators per field type. Case-insensitive whitespace-normalised string matching. | Handles every real-world pattern in the user's CSVs without OR-nesting complexity. Vendor rebrand without shared substring = 2 rules with same outcome category (acceptable mild duplication). |
| Q4 | Rule priority | **First-match-wins, priority-ordered** (integer `priority`, lower wins, default new = max+10). User reorders via `[↑]/[↓]` in rules list. Test sandbox shows which rule won and which others also matched. | Predictable, user-controlled. Matches Gmail filters and Stripe radar. |
| Q5 | Rule outcome | **`categoryId` only** (rules set the category). Vendor identity is set by a separate auto-vendor-matching pass running BEFORE the rule pass. Rule conditions CAN reference `vendor IS X`. `noteOnApply` optional appended note. | Separates "what type of flow" from "who it's with"; rules stay focused. |
| Q+1 | Vendor model | **New `Vendor` model in Phase B**, with `aliases[]` (case-insensitive substrings) + `kind` enum. ~38-vendor default seed. Two-step extraction wizard. | User has 300+-row CSV to extract from; default seed handles common AU vendors out of the box. |
| Q+2 | AI learning preparation | **`CategorisationEvent` audit log** + `Rule.hitCount` + `Rule.lastFiredAt` added in Phase B. Records every change so Phase C's AI can read user history as few-shot examples. | Phase C needs training data from day one; the schema cost is one table + two columns. |
| Q+3 | Re-categorise UX | Dialog with `(.) Uncategorised only [default] ( ) All`, `[✓] Preserve manual splits [on by default]`. | Safe defaults; explicit opt-in for destructive scopes. |
| Q+4 | Test Rules sandbox | At `/rules/test`. Source picker (existing transactions w/ date+account filter, OR uploaded CSV). Selectable rule subset incl. inactive rules. Results table shows winner + also-matched. Stateless. CSV mode never persists the file. | Iteration loop with no consequences = main value of the page. |

Architecture: **Approach 1** — four NestJS modules (`categories`, `vendors`, `rules`, `rule-engine`), engine is a synchronous pure-function-style service.

Locked defaults:
- Engine passes: vendor-match always runs before rule-match.
- Vendor seed: 38 rows shipped via `seed.ts`.
- Vendor extraction wizard is on-demand only (not auto-triggered after every import).
- Rules engine is synchronous (no BullMQ); ~10k-row runs complete in <2s.
- Reorder via `[↑]/[↓]` neighbour-swap, not drag-and-drop.
- Test sandbox at `/rules/test`. Banner: "Rules Test Ground — changes do not apply to any transactions."

---

## 2. Architecture overview

```
Browser
  └─ Next.js (frontend)
       ├─ /categories                Categories list + CRUD
       ├─ /vendors                   Vendors list, CRUD, extraction wizard
       ├─ /rules                     Ordered rules list with priority controls
       ├─ /rules/test                Sandbox
       ├─ /transactions              (existing) + Re-categorise + Split + new columns
       └─ /accounts/[id]             (existing) + Categorisation status + Re-categorise shortcut

NestJS backend
  ├─ categories/                     CRUD; 409 on delete-when-in-use
  ├─ vendors/                        CRUD + vendor-extractor.service.ts (wizard)
  ├─ rules/                          CRUD + priority reorder + state transitions
  └─ rule-engine/                    two-pass engine + bulk re-categorise + sandbox endpoint

PostgreSQL
  └─ 5 new tables: Category, Vendor, Rule, RuleCondition, TransactionSplit, CategorisationEvent
     + Transaction model modifications (categoryId FK, vendorCustomerId → vendorId rename, ruleId, categorisedAt)
     + Rule.hitCount, Rule.lastFiredAt
```

No new external services, no new env vars, no BullMQ work. No new backend or frontend dependencies.

**Wipe required**: The `vendorCustomerId → vendorId` rename is non-additive. Existing dev DBs need `docker compose down -v` before the first Phase B boot. The seeded sample transactions get wiped; the user re-imports from `temp/*.csv` (still gitignored, still on disk).

---

## 3. Data model (Prisma)

### New enums

```prisma
enum CategoryKind { INCOME  EXPENSE  TRANSFER  OTHER }

enum VendorKind { MERCHANT  PERSON  CUSTOMER  BANK  OTHER }

enum RuleState {
  USER          // human-created; default for Phase B
  AI_DRAFTED    // Phase C only — AI proposed, awaiting user review
  APPROVED      // Phase C only — AI-drafted that user accepted
  DENIED        // Phase C only — AI-drafted that user rejected
}

enum RuleField    { DESCRIPTION  AMOUNT  VENDOR  ACCOUNT }

enum RuleOperator {
  CONTAINS  EQUALS  STARTS_WITH  ENDS_WITH
  GT  LT  BETWEEN
  IN
}

enum EventSource {
  USER            // manual single-row category/split/vendor change
  RULE            // a Rule fired during a categorisation pass
  VENDOR_MATCH    // pass-1 auto-vendor-match (no rule involved)
  AI_DRAFT        // Phase C: AI suggested a categorisation (not yet user-reviewed)
  AI_APPLIED      // Phase C: user accepted/edited an AI suggestion
}
```

### New models

```prisma
model Category {
  id        String       @id @default(uuid())
  name      String       @unique
  kind      CategoryKind
  isActive  Boolean      @default(true)
  sortOrder Int          @default(100)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  transactions      Transaction[]
  transactionSplits TransactionSplit[]
  rules             Rule[]
}

model Vendor {
  id        String     @id @default(uuid())
  name      String     @unique
  kind      VendorKind
  // Lowercase substrings, case-insensitive whitespace-normalised matching.
  // A vendor "matches" a transaction iff any alias is a substring of
  // normaliseDesc(transaction.description).
  aliases   String[]
  notes     String?
  isActive  Boolean    @default(true)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  transactions Transaction[]
  rules        Rule[]
}

model Rule {
  id          String     @id @default(uuid())
  name        String                          // user-facing label
  state       RuleState  @default(USER)
  isActive    Boolean    @default(true)       // engine considers active iff state ∈ {USER, APPROVED} AND isActive
  priority    Int        @default(1000)       // lower = higher priority; new rules go to max+10 (10-spaced for cheap inserts)

  categoryId  String
  category    Category   @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  vendorId    String?                         // unused by Phase B engine; Phase C may set on AI-drafted rules
  vendor      Vendor?    @relation(fields: [vendorId], references: [id], onDelete: SetNull)
  noteOnApply String?                         // optional appended note on Transaction.notes when this rule fires

  // Effectiveness metrics — incremented by the engine after each pass.
  // Surface in /rules list to spot unused or over-broad rules; consumed by
  // Phase C's AI as part of the rule profile.
  hitCount    Int        @default(0)
  lastFiredAt DateTime?

  conditions   RuleCondition[]
  events       CategorisationEvent[]
  transactions Transaction[]                   // inverse of Transaction.ruleId — rule that last categorised the transaction

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([priority])
  @@index([state, isActive])
}

model RuleCondition {
  id        String       @id @default(uuid())
  ruleId    String
  rule      Rule         @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  field     RuleField
  operator  RuleOperator
  value     String                            // serialised — number-as-string for AMOUNT, UUID for VENDOR/ACCOUNT
  value2    String?                           // upper bound for BETWEEN
  valueList String[]                          // for IN
  position  Int          @default(0)

  @@index([ruleId])
}

model TransactionSplit {
  id            String      @id @default(uuid())
  transactionId String
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  categoryId    String
  category      Category    @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  amount        Decimal     @db.Decimal(14, 2)
  notes         String?
  position      Int         @default(0)

  @@index([transactionId])
}

model CategorisationEvent {
  id            String      @id @default(uuid())
  transactionId String
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  source        EventSource
  ruleId        String?
  rule          Rule?       @relation(fields: [ruleId], references: [id], onDelete: SetNull)

  oldCategoryId String?
  newCategoryId String?
  oldVendorId   String?
  newVendorId   String?

  // Phase C only: did the user accept the AI's suggestion verbatim,
  // edit it before accepting, or reject it? Strongest few-shot signal.
  acceptedAiSuggestion Boolean?

  createdAt     DateTime    @default(now())

  @@index([transactionId])
  @@index([source, createdAt])
  @@index([ruleId])
}
```

### Transaction model modifications (in `backend/prisma/schema.prisma`)

```prisma
model Transaction {
  // ... existing Phase A fields stay ...

  // CHANGED: real FK to Category.
  categoryId    String?
  category      Category?  @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  // RENAMED from vendorCustomerId; real FK to Vendor.
  vendorId      String?
  vendor        Vendor?    @relation(fields: [vendorId], references: [id], onDelete: SetNull)

  // notes already exists from Phase A; keep as-is.
  notes         String?

  // NEW: which rule last set categoryId (powers report popup + Phase C learning).
  ruleId        String?
  rule          Rule?      @relation(fields: [ruleId], references: [id], onDelete: SetNull)

  // NEW: timestamp of last categorisation pass (null = uncategorised).
  categorisedAt DateTime?

  splits        TransactionSplit[]
  events        CategorisationEvent[]
}
```

**Splits semantics** (server-enforced):

- A transaction has EITHER `categoryId` set with zero splits (common case), OR 1+ splits with `categoryId=null`. UI prevents the conflicting state.
- `SUM(split.amount) == transaction.amount` is validated on save (POST/PATCH `/transactions/:id/splits`). Save rejected with 422 if the sum differs by more than $0.005 (allowing for floating-point noise).
- Rules **never** create or modify splits.
- The re-categorise engine skips transactions with `splits.length > 0` when `preserveSplits=true` (default).

---

## 4. Backend module layout

```
backend/src/
├── categories/
│   ├── categories.module.ts
│   ├── categories.controller.ts
│   ├── categories.service.ts
│   └── dto.ts
│
├── vendors/
│   ├── vendors.module.ts
│   ├── vendors.controller.ts
│   ├── vendors.service.ts
│   ├── vendor-extractor.service.ts    // wizard: scan descriptions → candidate vendors
│   └── dto.ts
│
├── rules/
│   ├── rules.module.ts
│   ├── rules.controller.ts
│   ├── rules.service.ts
│   └── dto.ts
│
└── rule-engine/
    ├── rule-engine.module.ts
    ├── rule-engine.service.ts          // two-pass orchestrator (calls Prisma)
    ├── rule-matcher.ts                 // pure function: rule + transaction → boolean
    ├── vendor-matcher.ts               // pure function: description + vendors[] → vendor | null
    ├── rule-engine.controller.ts
    └── dto.ts
```

Plus modifications:
- `transaction-imports/transaction-imports.service.ts` — `commit()` now accepts `applyRules: boolean`; when true, calls `RuleEngineService.run()` over just-inserted transactions.
- `backend/src/app.module.ts` — registers the four new modules.

### Endpoints

```
# Categories — CRUD
GET    /categories
POST   /categories                                  body: { name, kind, sortOrder? }
PATCH  /categories/:id
DELETE /categories/:id                              409 if any Transaction / Split / Rule references it

# Vendors — CRUD + extraction wizard
GET    /vendors                                     (?includeInactive=true)
GET    /vendors/:id
POST   /vendors                                     body: { name, kind, aliases[], notes? }
PATCH  /vendors/:id
DELETE /vendors/:id                                 Transaction.vendorId becomes null via FK SetNull

POST   /vendors/extract                             body: { source: 'all-transactions' | 'csv', csvBase64?, dateFrom?, dateTo?, accountIds? }
                                                    → { candidates: [{ suggestedName, aliases[], matchCount, sampleDescriptions[≤3], existsAs?, suggestedKind }] }
POST   /vendors/extract/commit                      body: { candidates: [{ name, kind, aliases[] }] }
                                                    → { created: number, updated: number, skipped: number }

# Rules — CRUD + priority + state
GET    /rules                                       (?state=...&isActive=...)
GET    /rules/:id                                   includes conditions
POST   /rules                                       create with conditions in same request
PATCH  /rules/:id                                   replaces conditions atomically
DELETE /rules/:id                                   Transaction.ruleId becomes null
PATCH  /rules/:id/move                              body: { direction: 'up' | 'down' }  → swaps priority with neighbour
PATCH  /rules/:id/state                             body: { state: 'APPROVED' | 'DENIED' }  (used in Phase C; exposed in Phase B for testing)
PATCH  /rules/:id/toggle-active                     body: { isActive: boolean }

# Rule engine
POST   /rule-engine/recategorise                    body: { scope: 'uncategorised' | 'all', accountIds?, dateFrom?, dateTo?, preserveSplits: true }
                                                    → { matched, vendorMatched, unchanged, preservedSplits, perRule: [...] }
POST   /rule-engine/test                            body: { source: 'csv' | 'existing', csvBase64?, dateFrom?, dateTo?, accountIds?, ruleIds[]?, applyVendorMatch: true }
                                                    → { rows: [...], stats: {...} }  (dry-run; no DB writes)

# Transactions — splits + single-row category
POST   /transactions/:id/splits                     body: { splits: [{ categoryId, amount, notes? }] }
                                                    Validates SUM == transaction.amount; replaces all splits atomically.
DELETE /transactions/:id/splits                     Removes all splits. If exactly one split existed, restores it as categoryId.
PATCH  /transactions/:id/category                   body: { categoryId?, vendorId?, notes?, ruleId? }
                                                    Manual single-row override. Writes a CategorisationEvent with source=USER.

# Categorisation history
GET    /categorisation-events?transactionId=&limit=&source=
                                                    Per-transaction or filtered history view.

# CSV import — modified
POST   /transaction-imports/commit                  Phase A request body + `applyRules: boolean`. When true, engine runs over just-inserted transactions and the ImportReport includes `ruleCategorisation` summary.
```

All endpoints synchronous. No new dependencies.

---

## 5. The two-pass engine

### Pure-function contract

```ts
type EngineInput = {
  transactionIds?: string[];
  filter?: { accountIds?: string[]; dateFrom?: string; dateTo?: string; scope: 'uncategorised' | 'all' };
  ruleIds?: string[];          // empty = all active rules
  preserveSplits: boolean;
  applyVendorMatch: boolean;
  applyRules: boolean;
  dryRun: boolean;
};

type EngineRowResult = {
  transactionId: string;
  date: string; amount: string; description: string;
  vendorMatch: { vendorId: string; vendorName: string } | null;
  vendorMatchAmbiguous: boolean;
  ruleMatch: { ruleId: string; ruleName: string; priority: number; categoryId: string; categoryName: string } | null;
  allMatchingRules: Array<{ ruleId: string; ruleName: string; priority: number }>;
  skipped: 'has-splits' | 'no-rule-match' | null;
};

type EngineOutput = {
  rows: EngineRowResult[];
  stats: {
    total: number;
    vendorMatched: number;
    ruleMatched: number;
    preservedSplits: number;
    unchanged: number;
    perRule: Array<{ ruleId: string; ruleName: string; count: number }>;
  };
};
```

### Pass 1 — vendor matching

```
For each transaction:
  normalised = description.trim().toLowerCase().replace(/\s+/g, ' ')
  matches = vendors.filter(v => v.isActive && v.aliases.some(a => normalised.includes(a)))
  if matches.length === 0: vendorMatch = null
  if matches.length === 1: vendorMatch = matches[0], ambiguous = false
  if matches.length > 1: vendorMatch = pickByLongestAlias(matches), ambiguous = true
```

Performance: O(N × V × A) where N = transactions, V = vendors, A = avg aliases. For 10k × 40 × 3 = 1.2M `String.includes` calls ≈ 12ms total.

### Pass 2 — rule matching

```
activeRules = rules.filter(r =>
  (r.state === USER || r.state === APPROVED) &&
  r.isActive === true &&
  (input.ruleIds is empty OR r.id ∈ input.ruleIds)
).sort(by priority asc)

For each transaction (after pass 1):
  if preserveSplits AND transaction.hasSplits: skipped = 'has-splits', continue
  winner = null, allMatching = []
  For each rule in activeRules:
    if allConditionsMatch(rule.conditions, transaction):
      allMatching.push(rule)
      if winner === null: winner = rule
  ruleMatch = winner
```

Single-condition match logic per `(field, operator, value)`:

| Field | Operator | Logic |
|---|---|---|
| DESCRIPTION | CONTAINS | `normaliseDesc(tx.description).includes(normaliseDesc(value))` |
| DESCRIPTION | EQUALS | `normaliseDesc(tx.description) === normaliseDesc(value)` |
| DESCRIPTION | STARTS_WITH | `normaliseDesc(tx.description).startsWith(normaliseDesc(value))` |
| DESCRIPTION | ENDS_WITH | `normaliseDesc(tx.description).endsWith(normaliseDesc(value))` |
| AMOUNT | EQUALS | `Math.abs(Number(tx.amount) - Number(value)) < 0.005` |
| AMOUNT | GT | `Number(tx.amount) > Number(value)` |
| AMOUNT | LT | `Number(tx.amount) < Number(value)` |
| AMOUNT | BETWEEN | `Number(tx.amount) >= Number(value) && Number(tx.amount) <= Number(value2)` |
| VENDOR | EQUALS | `tx.vendorId === value` |
| VENDOR | IN | `valueList.includes(tx.vendorId)` |
| ACCOUNT | EQUALS | `tx.accountId === value` |
| ACCOUNT | IN | `valueList.includes(tx.accountId)` |

All conditions in a rule are ANDed.

### Apply + log step

Inside a single `prisma.$transaction` (when `dryRun=false`):

```
For each row where vendorMatch and tx.vendorId !== matchedVendor.id:
  UPDATE Transaction.vendorId
  INSERT CategorisationEvent(source=VENDOR_MATCH, ruleId=null, oldVendorId, newVendorId)

For each row where ruleMatch:
  UPDATE Transaction.categoryId, ruleId=winner.id, categorisedAt=NOW
  IF rule.noteOnApply: UPDATE Transaction.notes (append, preserve existing user notes — separator: '\n')
  INSERT CategorisationEvent(source=RULE, ruleId=winner.id, oldCategoryId, newCategoryId)

For each rule that fired in this pass:
  UPDATE Rule SET hitCount = hitCount + perRule[id], lastFiredAt = NOW

Return stats + rows.
```

Transactions that match no rule and no vendor are left untouched. `categorisedAt` is NOT updated, so later re-categorise passes with `scope=uncategorised` still pick them up.

### Sandbox vs production

The sandbox calls the engine with `dryRun: true`. The engine:
- For `source=existing`: loads transactions normally from the DB.
- For `source=csv`: synthesises `EngineRowResult` inputs from parsed CSV rows — no DB read of transactions.
- Computes all `EngineRowResult` entries.
- Returns the same `EngineOutput` shape.
- **Does NOT** open a Prisma transaction, **does NOT** write anything, **does NOT** increment `Rule.hitCount`.

CSV-mode parsed rows are held in-memory for the request and discarded. This is the design promise of the "Rules Test Ground" banner.

### Edge cases

- Empty rules list → vendor-match pass only; every `ruleMatch = null`.
- Rule references deleted category → impossible (`onDelete: Restrict`); delete is blocked at the API layer.
- Rule with zero conditions → save blocked by rule editor + service-level validator (422).
- Vendor condition references deleted vendor → condition never matches; rule editor surfaces a warning.
- Concurrent re-categorise + import → both go through the engine's serialising Prisma transaction. Last write wins per transaction; CategorisationEvent log captures both.

---

## 6. Vendor seed + extraction wizard

### Default vendor seed (38 rows)

Seeded in `backend/prisma/seed.ts`, only on a fresh User-empty DB. The full list with aliases:

| Vendor | Kind | Aliases |
|---|---|---|
| BP | MERCHANT | `["bp ", "bp australia", "bp connect"]` |
| Caltex | MERCHANT | `["caltex", "ampol caltex"]` |
| Shell | MERCHANT | `["shell ", "shell coles"]` |
| Ampol | MERCHANT | `["ampol", "caltex ampol"]` |
| 7-Eleven | MERCHANT | `["7-eleven", "7 eleven", "7eleven"]` |
| Costco | MERCHANT | `["costco"]` |
| Liberty | MERCHANT | `["liberty oil", "liberty service"]` |
| Mobil | MERCHANT | `["mobil "]` |
| Vibe | MERCHANT | `["vibe service", "vibe petroleum"]` |
| United | MERCHANT | `["united petroleum"]` |
| Woolworths | MERCHANT | `["woolworths", "woolies", "ww metro", "ww supermarkets"]` |
| Coles | MERCHANT | `["coles ", "coles supermarkets", "coles express"]` |
| IGA | MERCHANT | `["iga "]` |
| ALDI | MERCHANT | `["aldi "]` |
| Foodland | MERCHANT | `["foodland"]` |
| PayPal | MERCHANT | `["paypal", "617704"]` |
| Stripe | MERCHANT | `["stripe payments"]` |
| eBay | MERCHANT | `["ebay "]` |
| Amazon AU | MERCHANT | `["amazon au", "amazon.com.au", "amzn mktp au"]` |
| Apple | MERCHANT | `["apple.com/bill", "apple pty ltd"]` |
| Google Play | MERCHANT | `["google *play", "google play"]` |
| Telstra | MERCHANT | `["telstra"]` |
| Optus | MERCHANT | `["optus ", "singtel optus"]` |
| Vodafone | MERCHANT | `["vodafone"]` |
| TPG | MERCHANT | `["tpg internet", "tpg telecom"]` |
| Aussie Broadband | MERCHANT | `["aussie broadband"]` |
| Synergy | MERCHANT | `["synergy "]` |
| Water Corp | MERCHANT | `["water corp", "water corporation"]` |
| Alinta Energy | MERCHANT | `["alinta energy", "alinta gas"]` |
| RAC | MERCHANT | `["rac ", "raci ", "250930"]` |
| NRMA | MERCHANT | `["nrma "]` |
| AAMI | MERCHANT | `["aami "]` |
| Allianz | MERCHANT | `["allianz"]` |
| Bupa | MERCHANT | `["bupa "]` |
| Medibank | MERCHANT | `["medibank"]` |
| Commonwealth Bank | BANK | `["commbank", "cba ", "commonwealth bank"]` |
| NAB | BANK | `["national australia bank", "nab "]` |
| Westpac | BANK | `["westpac"]` |
| ANZ | BANK | `["anz "]` |

Trailing spaces in aliases prevent false positives (`"rac "` won't match `"racing"`).

### Default category seed (15 rows)

| Name | Kind | sortOrder |
|---|---|---|
| Income — Customer payments | INCOME | 10 |
| Income — Personal | INCOME | 20 |
| Income — Refunds | INCOME | 30 |
| Income — Other | INCOME | 40 |
| Expense — Rent | EXPENSE | 110 |
| Expense — Utilities | EXPENSE | 120 |
| Expense — Telecom | EXPENSE | 130 |
| Expense — Insurance | EXPENSE | 140 |
| Expense — Groceries | EXPENSE | 150 |
| Expense — Fuel | EXPENSE | 160 |
| Expense — Subscriptions & Online | EXPENSE | 170 |
| Expense — Personal | EXPENSE | 180 |
| Expense — Bank fees | EXPENSE | 190 |
| Transfer — Between own accounts | TRANSFER | 210 |
| Other — Uncategorised review | OTHER | 999 |

### Extraction wizard

Three-step flow surfaced via "Suggest vendors from transactions" button on `/vendors`:

**Step 1 — Source**: radio between "Use all imported transactions" (with optional date + account filters) and "Upload a CSV" (drag-and-drop + sniff confirmation, file held in memory only).

**Step 2 — Backend extraction algorithm** (`vendor-extractor.service.ts`):

```
1. Collect descriptions from source.
2. Normalise: lowercase, collapse whitespace, strip trailing digit runs >= 6 chars
   (reference numbers) and known noise prefixes ("direct debit", "direct credit",
   "fast transfer from/to", "transfer to other bank", "transfer to/from",
   "commbank app", "netbank").
3. Tokenise: split on whitespace; drop tokens of length ≤ 2 unless they're stop-tokens
   (BP, WW, etc — small allow-list).
4. Build 1- to 3-token n-grams.
5. For each n-gram, count distinct descriptions it appears in.
6. Filter: n-grams appearing in ≥3 distinct descriptions AND with high IDF
   (rare relative to a baseline noise corpus).
7. Dedupe against existing Vendor.aliases. Mark candidates whose alias collides
   with an existing vendor as `existsAs: <vendor-name>`.
8. Return up to 100 candidates sorted by matchCount desc.
```

Each candidate: `{ suggestedName, aliases[], matchCount, sampleDescriptions[≤3], existsAs?, suggestedKind }`. Kind heuristic: positive average amount → CUSTOMER, negative → MERCHANT or PERSON (look for capitalised words like first names — fallback PERSON for two-word title-case, MERCHANT otherwise).

**Step 3 — Review checklist**: editable rows with checkbox, name, kind, aliases (chip input), match count, sample-descriptions reveal. Existing-vendor candidates are unchecked by default but tickable (would merge new aliases into the existing vendor's `aliases[]`). "Create selected" → `POST /vendors/extract/commit`. Success: shown a confirmation with "Run Re-categorise now" shortcut.

---

## 7. Frontend routes + components

### Routes

```
/categories                          Categories list + CRUD
/categories/new
/categories/[id]/edit

/vendors                             Vendors list
/vendors/new
/vendors/[id]/edit
/vendors/extract                     Wizard (modal-as-page); returns to /vendors

/rules                               Ordered rules list
/rules/new
/rules/[id]/edit
/rules/test                          Test Rules sandbox

(Phase A pages get updates — see below.)
```

### New components

```
frontend/components/categories/
├── categories-list.tsx              <FilteredList>: Name · Kind · Used · Status
└── category-form.tsx                EditPageChrome-wrapped form

frontend/components/vendors/
├── vendors-list.tsx                 <FilteredList>: Name · Kind · Aliases preview · Used · Status
├── vendor-form.tsx                  EditPageChrome-wrapped form
├── alias-chip-input.tsx             Comma/Enter-separated chip input
└── vendor-extractor.tsx             3-step wizard

frontend/components/rules/
├── rules-list.tsx                   Ordered list with state-tabs filter + priority controls
├── rule-row.tsx                     priority# · name · conditions summary · category · hits · [↑/↓ Edit Delete]
├── rule-form.tsx                    EditPageChrome-wrapped form
├── rule-condition-row.tsx           field → operator → value (shape adapts to field type)
├── rule-conditions-editor.tsx       Manages N condition rows + presets ("Income only", "Expense only")
├── rule-outcome-editor.tsx          Category dropdown + optional vendor + noteOnApply
└── rule-test-sandbox.tsx            /rules/test page

frontend/components/transactions/
├── transactions-table.tsx           (modified) new Category + Vendor columns + row-menu actions
├── split-modal.tsx                  Split rows with "Remaining: $X" badge
├── recategorise-dialog.tsx          Scope radio + preserveSplits + apply + results card
└── transaction-row-menu.tsx         "...": Split | Edit category | Create rule from this row
```

### Sidebar nav additions

Banking group gains two entries (Categories, Vendors):

```
Banking:
  - Accounts
  - Transactions
  - Categories      ← new
  - Vendors         ← new
  - Rules
```

### Rules list (`/rules`) priority UI

Not a `<FilteredList>` — explicit ordered list. Each row:

```
1   RACI insurance                                         [✓ Active] [↑] [↓] [Edit] [Delete]
    description contains "raci"   ·   Expense — Insurance
    Hits: 4 · Last fired May 2026
```

State filter tabs: "USER (12) | APPROVED (0) | AI Drafts (0) | Denied (0)". Phase B populates only USER; Phase C populates the others.

Priority stored as INT spaced by 10 (1000, 1010, 1020, …). Inserts use midpoint integer. If gap collapses to 1, the rules service rebalances all priorities transactionally.

### Rule editor

`EditPageChrome`-wrapped form. Layout:

```
Name:        [____________________________]
State:       [USER ▾]   (read-only for USER rules)

── Conditions (ALL must match) ──
Presets:     [Income only]  [Expense only]
[ field ▾ ]  [ operator ▾ ]  [ value ____ ]    [×]
[ field ▾ ]  [ operator ▾ ]  [ value ____ ]    [×]
[+ Add condition]

── Outcome ──
Category:           [ Expense — Insurance ▾ ]
Vendor (optional):  [ — none —             ▾ ]
Note (optional):    [____________________________]

[ Cancel ]  [ Save ]
```

Value-input shape adapts to (field, operator):
- DESCRIPTION + CONTAINS/STARTS_WITH/ENDS_WITH/EQUALS → text input.
- AMOUNT + EQUALS/GT/LT → number input step 0.01.
- AMOUNT + BETWEEN → two number inputs.
- VENDOR + EQUALS → searchable vendor dropdown.
- VENDOR + IN → multi-select vendor chips.
- ACCOUNT + EQUALS/IN → account dropdown/chips.

Inline sample-matches preview at the bottom: live counter ("Sample matches: 4 transactions") via debounced call to `/rule-engine/test`.

### Split modal

Triggered from transactions row-menu. Pre-populates with one split = (current categoryId, full amount). User adds rows. "Remaining" badge: green at $0.00, amber otherwise. Save disabled until $0.00. Removing all splits except one and saving converts back to single `categoryId`.

### Re-categorise dialog

Triggered from transactions table top action. Pre-fills with the table's current filter (account + date range). Dialog:

```
Apply rules to:  (.) Uncategorised only (current filter)
                 ( ) All transactions (current filter)
[✓] Preserve manual splits (recommended)
Will process: ~47 transactions
[Cancel] [Re-categorise]
```

Result card replaces the dialog body after run:

```
✓ Categorised 31 transactions
  • RACI insurance: 4
  • PayPal expenses: 6
  • Office rent: 3
  ...

⚠ 14 had no rule match (still uncategorised)
  3 had ambiguous vendor matches
  2 skipped (already split)

[Close]
```

### Transactions table additions

- New columns: Category (pill, kind-coloured), Vendor (chip). Both sortable.
- Row menu: Split | Edit category | Create rule from this row.
- Top action: Re-categorise button (in addition to Filter).
- Account-mode rows: Vendor appears as smaller chip under the description (saving horizontal space).
- Global-mode rows: Vendor gets its own column.

### Account header card additions

`<AccountHeaderCard>` (`/accounts/[id]`) gains a line:

```
Categorisation: 198 of 234 categorised (84%) · 36 uncategorised
                [Re-categorise uncategorised]
```

Button shortcut → re-categorise dialog pre-scoped to this account + `scope=uncategorised`.

---

## 8. Test Rules sandbox (`/rules/test`)

### Banner (always visible)

```
⚠ Rules Test Ground
  This is a sandbox. Nothing on this page changes any transaction.
  No categorisations are written. No rules are modified.
```

Yellow card with `AlertTriangle` icon. Persists even after a successful run.

### Region 1 — Configure

Two-column card layout. Left: source picker (existing-transactions w/ date+account filters OR upload-CSV). Right: rule selection checklist with mass toggle + "include vendor matching" checkbox.

CSV-mode files go through the same sniff+confirm flow as Phase A's import. After confirmation, parsed rows are held in client state — re-run tests against the same upload don't require re-upload.

### Region 2 — Results

Summary strip (Tested N · Vendor matched · Rule matched · No match · Multiple matches · Ambiguous vendor · Skipped split). Stat tiles colour-coded.

Results table:

| Date | Description | Amount | Vendor matched | Rule that wins | Category | Also matches |
|---|---|---|---|---|---|---|

Each row links to the winning rule's editor in a new tab. "Also matches" lists every other rule that matched but lost on priority — clickable.

### Region 3 — Quick actions

- **Re-run test** (cheap; no DB write).
- **Export results as CSV** (verbatim download).
- **Apply these rules now** (bridge to bulk re-categorise dialog; only shown in `source=existing` mode).

### CSV-mode caveats

`source=csv`: parsed rows are never persisted. The "Apply these rules now" button is hidden — replaced with "To save these transactions, use the Banking import flow" linking to `/accounts`.

---

## 9. Integration into Phase A flows

### CSV import dialog (`column-mapping-step.tsx`)

New control above the Cancel/Import buttons:

```
── After import ──
[✓] Categorise based on rules
    Runs vendor matching + active rules over the just-imported transactions.
```

Default unchecked (explicit opt-in). Sets `applyRules: true` in the commit request.

### `transaction-imports.service.commit()`

After the existing dedupe+insert flow, if `applyRules: true`:

```
const engineResult = await this.ruleEngine.run({
  transactionIds: justInsertedIds,
  applyVendorMatch: true,
  applyRules: true,
  preserveSplits: true,
  dryRun: false,
});
```

Result folded into `ImportReport.ruleCategorisation`:

```ts
ruleCategorisation: {
  enabled: boolean;
  vendorMatched: number;
  ruleMatched: number;
  perRule: Array<{ ruleId, ruleName, categoryName, count }>;
  ambiguousVendor: number;
} | null;  // null when checkbox was unchecked
```

### `<ImportReportPopup>`

New collapsible "Categorisation" section between Imported and Duplicates, populated only when `ruleCategorisation` is non-null:

```
▾ Categorisation                    (17 categorised, 22 vendor matches)
  Vendor matches:    22
  Rule matches:      17
  Per rule:
    RACI insurance — Expense — Insurance:        4
    PayPal expenses — Expense — Subscriptions:   6
    DYSON customer payments — Income — Customer: 2
    ...
  Ambiguous vendor matches: 0
```

Same component renders in the post-import dialog AND at `/settings/import-logs/[id]`.

### Transactions table

- New Category + Vendor columns (sortable).
- Row menu: Split, Edit category, Create rule from this row.
- Top action: Re-categorise.

### Account header card

Adds categorisation-status line + "Re-categorise uncategorised" shortcut.

---

## 10. User manual deliverable

**Path**: `docs/user-guide-banking.md`. Written as the **last task** in the implementation plan, after all features are built and verified.

Screenshots captured via Playwright MCP after `docker compose down -v && up -d` + seed + import of `temp/1.csv`, `temp/2.csv`, `temp/3.csv`. Saved to `docs/images/user-guide-banking/<slug>.png`.

### Required sections

1. **What Banking is** — conceptual model in one paragraph.
2. **Accounts** — list page, edit page, archive/restore, current-balance computation.
3. **Transactions** — global vs per-account view, columns, filters, splits, manual category, row-menu.
4. **CSV Import — full workflow with every screen**:
   - 4.1 Trigger from account page
   - 4.2 Choose file (types, 10 MB cap, file handling)
   - 4.3 Sniff: what the system inferred (date format, header row, column roles), how to override
   - 4.4 Confirm-mapping step (dropdown UI, column-role explanations, Style A vs Style B)
   - 4.5 The "Categorise based on rules" checkbox — what it does, when to tick
   - 4.6 Already-imported-file warning
   - 4.7 Commit → report popup sections (Imported, Duplicates, Failed, Categorisation)
   - 4.8 Where the report lives at `/settings/import-logs`
5. **Categories** — kind enum, sortOrder, default seed, how to add your own.
6. **Vendors** — concept, aliases, default seed table (full list), case-insensitive substring matching with real CSV examples.
7. **Vendor extraction wizard** — step-by-step with screenshots, source choice, dedupe behaviour.
8. **Rules**:
   - 8.1 Concept (AND-only, priority, states, isActive toggle)
   - 8.2 Rule editor — every field, every operator, with real examples
   - 8.3 Rules list — priority numbers, `[↑]/[↓]`, hit count, last fired
   - 8.4 Worked example: "Every PayPal expense → Subscriptions & Online" end-to-end
   - 8.5 Worked example: priority conflict — office rent / personal payments overlap, how to fix
9. **Test Rules sandbox** — every region, every column, the re-run iteration loop, why nothing changes.
10. **Re-categorise** — bulk action, scope choice, preserve-splits safety, result card.
11. **Splits** — when to use them, the modal, what happens during re-categorise, how to undo.
12. **Categorisation history** — `CategorisationEvent` overview, per-transaction drawer, why this matters for Phase C.
13. **Rule effectiveness metrics** — hit counts, last fired, pruning unused rules, spotting over-broad rules.
14. **Phase C preview** — short paragraph on how AI will read approved rules + recent user actions as few-shot context.

Plain language, no jargon. Reviewed by the implementer for plain-English fluency before commit.

---

## 11. AI learning preparation (Phase C readiness)

Phase B adds `CategorisationEvent` + `Rule.hitCount` + `Rule.lastFiredAt` precisely so Phase C's AI has training data on day one. Phase C will use these techniques (no fine-tuning required; works with any OpenAI-compatible API):

1. **Few-shot prompting with approved rules** — every AI call includes the user's top N USER/APPROVED rules as exemplars.
2. **Few-shot with recent user actions** — last N=20 CategorisationEvents (especially `acceptedAiSuggestion` values) appended to the prompt.
3. **Embedding-based kNN suggestions** — when the provider exposes embeddings, cache description embeddings and use cosine-similarity over already-categorised history.
4. **Periodic rule consolidation** — manual-trigger AI sweep proposes merge/split.
5. **Rule effectiveness metrics** — `hitCount` / override-rate surfaces in `/rules` UI even in Phase B.

Phase B does NOT build any of this — but the data model supports it without further migration.

---

## 12. Doc updates to existing siblings

1. **`DatabaseSchema.md`** — Banking Phase B section: 5 new models, 5 new enums, Transaction modifications (categoryId real FK, vendorCustomerId → vendorId rename, ruleId, categorisedAt, Rule.hitCount/lastFiredAt, CategorisationEvent). Note the `down -v` requirement.

2. **`Architecture.md`** — add the 4 new NestJS modules. Add the new endpoints. Note the two-pass engine, the dryRun mode, the CategorisationEvent audit log.

3. **`modules_and_logic.md`** — four new module sections: Categories, Vendors, Rules, Categorisation Engine.

4. **`DesignSystem.md`** — category kind colours, vendor chip styling, Rules Test Ground banner spec, split modal layout.

5. **`CLAUDE.md`** — new gotchas:
   - `vendorCustomerId → vendorId` rename requires `down -v` for existing dev DBs.
   - `CategorisationEvent` is append-only — never UPDATE these rows.
   - Rule priority is INT spaced by 10. Moving swaps with neighbour. Inserts use midpoint. If gap collapses to 1, service rebalances all priorities transactionally.

---

## 13. Implementation order (preview)

Concrete tasks emerge from writing-plans. Rough sequence in ~24 tasks:

1. Prisma schema + enums + Transaction modifications + seed (~38 vendors + ~15 categories).
2. Backend — Categories module.
3. Backend — Vendors module (CRUD + dto).
4. Backend — vendor-extractor.service.ts + tests against `temp/*.csv` corpus.
5. Backend — Rules module (CRUD + priority reorder + state transitions).
6. Backend — rule-matcher.ts + vendor-matcher.ts pure functions + tests.
7. Backend — rule-engine.service.ts orchestrator + CategorisationEvent writes.
8. Backend — TransactionSplit endpoints + sum validation.
9. Backend — `/rule-engine/recategorise` + `/rule-engine/test` endpoints.
10. Backend — wire engine into `/transaction-imports/commit` (applyRules path).
11. Backend — `/categorisation-events` history endpoint.
12. Frontend — types + `lib/banking-rules.ts` api helpers.
13. Frontend — `/categories` pages.
14. Frontend — `/vendors` list + edit pages + alias chip input.
15. Frontend — vendor extraction wizard (`/vendors/extract`).
16. Frontend — `/rules` list with priority controls + state tabs.
17. Frontend — rule editor (conditions editor + outcome editor + sample-matches preview).
18. Frontend — `/rules/test` sandbox page.
19. Frontend — split modal + re-categorise dialog + row-menu integration.
20. Frontend — transactions table column additions + sort.
21. Frontend — import dialog "Categorise based on rules" checkbox + report popup section.
22. Frontend — account header categorisation status line + sidebar nav additions.
23. Doc updates (4 sibling docs + CLAUDE.md additions).
24. User manual `docs/user-guide-banking.md` with screenshots.
25. End-to-end manual verification (wipe + reseed + 3-CSV import with categorisation + sandbox test + manual rule creation + worked-example walkthroughs).

---

## 14. Out of scope for Phase B

Deferred — explicitly NOT to be built:

- AI provider settings + AI-drafted categorisation/rules (Phase C).
- AI rule consolidation / merge-split suggestions (Phase C).
- Embedding-based kNN suggestions (Phase C).
- Token-usage tracking (Phase C).
- Inter-account transfer matching (later phase).
- Personal-finance dashboard (Phase D).
- Drag-and-drop rule reordering (Phase B uses `[↑]/[↓]` only).
- Vendor extraction wizard auto-trigger after every import (Phase B is on-demand only).
- Rule conditions on transaction date or running-balance (deferred — current 4 fields cover real patterns).
- OR/NOT in rule conditions (deferred — AND-only confirmed sufficient).
- Bulk rule operations (delete N rules at once, export/import rules — deferred).
- Categorisation undo / replay from event log (deferred — Phase C may add).
