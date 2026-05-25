# Drop stored `runningBalance` — derive from `openingBalance + Σ(amount)` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the stored `Transaction.runningBalance` column. Compute balance on the fly from `Account.openingBalance + cumulative Σ(amount)`. Read the balance column from CSV imports (when present) for **validation only** — warn if the bank's last balance disagrees with `opening + sum(amount)`, then discard. Also improve the CSV column sniffer so it uses an arithmetic identity (`balance[n+1] − balance[n] ≈ amount[n+1]`) to pick the (amount, balance) pair — eliminating the column-swap class of bug uncovered while testing 3.csv.

**Architecture:**
- Backend: drop `Transaction.runningBalance` column; change `rowImportHash` to `date|amount|normalisedDesc` (no balance); importer parses balance from CSV when mapped but uses it only to emit a `balanceMismatch` warning, never writes it; sniffer's amount-vs-balance disambiguation switched to an arithmetic check.
- Frontend: drop `runningBalance` from `Transaction` type and edit modal; the transactions table computes the `Balance` column locally by sorting rows chronologically, running a cumulative sum from `openingBalance`, then re-applying the user's chosen sort.
- Same-day rows: cumulative sum runs in `(date ASC, id ASC)` order. Per-row balance for same-day rows is deterministic but arbitrary — it does NOT necessarily match what the bank statement showed. Documented as a known caveat.

**Tech Stack:** NestJS 10 + Prisma + PostgreSQL backend, Next.js 15 / React 19 frontend, Jest (ts-jest) for unit tests, Playwright (via MCP) for UI verification.

---

## Pre-flight: confirm starting state

Before Task 1, run these once to capture the baseline.

```bash
# Confirm the four files we'll touch + which docs reference the column.
grep -rln 'runningBalance' /home/reallybasic/Projects/Accounting/backend/src /home/reallybasic/Projects/Accounting/frontend
grep -n 'runningBalance' /home/reallybasic/Projects/Accounting/DatabaseSchema.md /home/reallybasic/Projects/Accounting/modules_and_logic.md /home/reallybasic/Projects/Accounting/CLAUDE.md
```

Expected: 9 source files and at least 3 doc files. Note any extras; if found, add them to Task 7.

---

## File map

**Files to modify:**
- `backend/prisma/schema.prisma` — drop `runningBalance` column (Task 6)
- `backend/src/transaction-imports/hash.ts` — change `rowImportHash` signature (Task 2)
- `backend/src/transaction-imports/types.ts` — `BalanceCheck` result shape (Task 3)
- `backend/src/transaction-imports/csv-sniffer.service.ts` — arithmetic-identity disambiguator (Task 1)
- `backend/src/transaction-imports/csv-sniffer.test.ts` — new tests (Task 1)
- `backend/src/transaction-imports/csv-parser.test.ts` — keep parser-side balance assertion (no change to parser; balance still parsed)
- `backend/src/transaction-imports/transaction-imports.service.ts` — stop writing `runningBalance`; emit `balanceMismatch` warning (Task 3)
- `backend/src/transactions/dto.ts` — drop `runningBalance` from sort whitelist (Task 4)
- `frontend/lib/types.ts` — drop `runningBalance` from `Transaction` (Task 5)
- `frontend/components/transactions/transactions-table.tsx` — compute Balance column locally (Task 5)
- `frontend/components/transactions/transaction-edit-modal.tsx` — drop the Balance row (Task 5)
- `DatabaseSchema.md`, `modules_and_logic.md`, `CLAUDE.md` — docs update (Task 7)

**Files NOT to touch (already correct):**
- `backend/src/accounts/accounts.service.ts` — already computes account `currentBalance` as `openingBalance + Σ(amount)`. Same model now extended to per-row.
- `backend/src/transaction-imports/csv-parser.service.ts` — parser still emits `runningBalance: string | null` in `ParsedRow` for the importer's validation pass. Do not delete that field.

---

## Task 1: Sniffer — arithmetic-identity disambiguator

**Context:** Today the sniffer picks which numeric column is `balance` vs `amount` by `changeRatio × signPurity`. When the account dips negative, `signPurity` collapses for the balance column and the heuristic gets the assignment wrong (this is what made 3.csv import with amount/balance swapped during testing). The robust signal is the identity `balance[n+1] − balance[n] ≈ amount[n+1]`: for any consecutive pair of rows, the balance change equals the next transaction. Pick the (amount, balance) ordering that satisfies this identity for the highest fraction of rows.

**Files:**
- Modify: `backend/src/transaction-imports/csv-sniffer.service.ts` lines 121-141
- Test: `backend/src/transaction-imports/csv-sniffer.test.ts`

- [ ] **Step 1.1: Add a failing test for the overdraft case (sniffer mis-identifies amount vs balance)**

Add to `csv-sniffer.test.ts` after the existing tests:

```typescript
run('Overdraft balance does not flip the amount/balance assignment', () => {
  // Real-world: account dips negative. Both columns have mixed signs.
  // Today's signPurity heuristic gets this wrong; arithmetic identity fixes it.
  const buf = Buffer.from(
    '02/03/2026,"-87.12","Direct Debit foo","+1759.99"\n' +
    '02/03/2026,"+1899.44","Direct Credit bar","+1847.11"\n' +
    '01/03/2026,"-0.53","Excess Interest","-52.33"\n' +
    '23/02/2026,"-300.00","Transfer out","-51.80"\n' +
    '23/02/2026,"+300.00","Transfer in","+248.20"\n' +
    '08/02/2026,"-55.00","Office rent","-51.80"\n',
  );
  const s = sniffCsv(buf);
  assert.deepEqual(s.mapping.columns, ['date', 'amount', 'description', 'balance']);
});

run('Swapped column order is correctly identified by arithmetic check', () => {
  // Same data as the first SAMPLE test, but columns reordered: date, balance, desc, amount.
  const buf = Buffer.from(
    '09/05/2026,"+7510.46","Transfer from DANIEL LIM","+422.04"\n' +
    '08/05/2026,"+7088.42","Transfer To Mani Dawa","-1750.00"\n' +
    '07/05/2026,"+10384.42","Direct Debit PAYPAL","-538.43"\n',
  );
  const s = sniffCsv(buf);
  assert.deepEqual(s.mapping.columns, ['date', 'balance', 'description', 'amount']);
});
```

- [ ] **Step 1.2: Run the tests to confirm the first test fails**

```bash
docker exec simplebooks-backend-1 npx ts-node src/transaction-imports/csv-sniffer.test.ts
```

Expected: existing 3 tests PASS, the new "Overdraft" test FAILS (columns come back as `['date', 'balance', 'description', 'amount']` instead of expected `['date', 'amount', 'description', 'balance']`).

If the `ts-node` invocation fails ("command not found"), fall back to: `docker exec simplebooks-backend-1 sh -c 'cd /app && npx jest --testPathPattern=csv-sniffer'` (jest will pick up `*.test.ts` files even though the in-file `run()` helper is hand-rolled). If neither works, copy the file to a tmp `.ts`, transpile with `npx tsc`, and run the resulting `.js`.

- [ ] **Step 1.3: Replace the amount/balance disambiguator with an arithmetic-identity check**

In `csv-sniffer.service.ts`, replace lines 121-141 (the existing `amountCandidates.length >= 2` block) with:

```typescript
  const amountCandidates = colScores
    .map((s, c) => ({ c, s }))
    .filter(({ c, s }) => c !== dateIdx && s.amount > 0.8)
    .sort((a, b) => b.s.amount - a.s.amount);

  if (amountCandidates.length >= 2) {
    // Score every (amountCol, balanceCol) ordered pair by how often the
    // arithmetic identity balance[n+1] - balance[n] ≈ amount[n+1] holds.
    // Tolerance: 1 cent. Strong signal — survives overdrafts where signPurity fails.
    const parseNum = (s: string) =>
      Number((s ?? '').replace(/^"|"$/g, '').replace(/^\+/, '').replace(/,/g, ''));
    const colValues = (c: number) => dataRows.map((r) => parseNum(r[c] ?? ''));

    function identityScore(amountCol: number, balanceCol: number): number {
      const a = colValues(amountCol);
      const b = colValues(balanceCol);
      if (b.length < 2) return 0;
      let hits = 0;
      for (let i = 1; i < b.length; i++) {
        if (Math.abs(b[i] - b[i - 1] - a[i]) < 0.01) hits++;
      }
      return hits / (b.length - 1);
    }

    let bestPair: { amountCol: number; balanceCol: number; score: number } | null = null;
    for (const { c: amountCol } of amountCandidates) {
      for (const { c: balanceCol } of amountCandidates) {
        if (amountCol === balanceCol) continue;
        const score = identityScore(amountCol, balanceCol);
        if (!bestPair || score > bestPair.score) {
          bestPair = { amountCol, balanceCol, score };
        }
      }
    }

    if (bestPair && bestPair.score >= 0.5) {
      roles[bestPair.amountCol] = 'amount';
      roles[bestPair.balanceCol] = 'balance';
      reasoning.push(`Col ${bestPair.amountCol}: signed amount`);
      reasoning.push(`Col ${bestPair.balanceCol}: running balance (arithmetic identity score ${bestPair.score.toFixed(2)})`);
    } else {
      // Fall back to the old heuristic when arithmetic check is inconclusive
      // (e.g. CSV rows aren't in date order — identity won't hold).
      const balancePick = [...amountCandidates].sort((a, b) => b.s.balance - a.s.balance)[0];
      const remaining = amountCandidates.filter((x) => x.c !== balancePick.c);
      const amountPick = remaining[0];
      if (balancePick.s.balance > 0.7) {
        roles[balancePick.c] = 'balance';
        reasoning.push(`Col ${balancePick.c}: running balance (changes every row)`);
      }
      if (amountPick) {
        roles[amountPick.c] = 'amount';
        reasoning.push(`Col ${amountPick.c}: signed amount`);
      }
    }
  } else if (amountCandidates.length === 1) {
    roles[amountCandidates[0].c] = 'amount';
    reasoning.push(`Col ${amountCandidates[0].c}: signed amount`);
  } else {
```

(Keep everything from `} else {` to end of function unchanged.)

- [ ] **Step 1.4: Re-run the tests to confirm all five pass**

```bash
docker exec simplebooks-backend-1 npx ts-node src/transaction-imports/csv-sniffer.test.ts
```

Expected: 5 PASS lines, 0 FAIL.

- [ ] **Step 1.5: Commit**

```bash
git add backend/src/transaction-imports/csv-sniffer.service.ts backend/src/transaction-imports/csv-sniffer.test.ts
git commit -m "$(cat <<'EOF'
fix(csv-sniffer): use balance[n+1]-balance[n]=amount[n+1] to disambiguate amount vs balance

The signPurity heuristic collapses when the account dips negative, causing
column mis-assignment for files like 3.csv. The arithmetic identity is a
much stronger signal and handles overdrafts and reordered column layouts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Hash formula — drop balance from per-row hash

**Context:** `rowImportHash(date, amount, description, runningBalance)` includes `runningBalance` in the sha256 input. Once we stop trusting balance as identity-defining (because it can drift across statement exports), the hash should be `date|amount|normalisedDesc`. This makes dedupe tighter: the same transaction in two different statement exports (with different running totals) now correctly deduplicates.

**Files:**
- Modify: `backend/src/transaction-imports/hash.ts`
- Test: existing `backend/src/transaction-imports/csv-parser.test.ts` (no functional change to parser; just verify it still passes)

- [ ] **Step 2.1: Change the `rowImportHash` signature**

Replace `backend/src/transaction-imports/hash.ts` lines 4-13 with:

```typescript
// sha256 of date|amount.toFixed(2)|normaliseDesc(description).
// runningBalance is intentionally excluded — balance is derived
// (openingBalance + Σ amount) and not stored on Transaction.
export function rowImportHash(
  date: string,
  amount: string,
  description: string,
): string {
  const payload = [date, amount, normaliseDesc(description)].join('|');
  return createHash('sha256').update(payload).digest('hex');
}
```

- [ ] **Step 2.2: Verify nothing else compiles against the old 4-arg signature**

```bash
grep -rn 'rowImportHash' /home/reallybasic/Projects/Accounting/backend/src
```

Expected: only two hits — the export in `hash.ts` and one call site in `transaction-imports.service.ts:80`. The call site will be updated in Task 3.

- [ ] **Step 2.3: Commit**

```bash
git add backend/src/transaction-imports/hash.ts
git commit -m "$(cat <<'EOF'
refactor(import-hash): drop runningBalance from per-row hash input

Hash now identifies transactions by date + amount + normalised description
only. Balance was a coincidental discriminator and made re-exports look
like new rows when the bank's running total drifted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Backend will not boot cleanly until Task 3 lands. The two tasks could be squashed into one commit; keeping them separate to keep diffs reviewable.)

---

## Task 3: Importer — stop writing `runningBalance`; emit `balanceMismatch` warning

**Context:** The importer currently writes `runningBalance` into every Transaction row. After this task it stops. It also gains a validation pass: if the CSV had a balance column mapped, compute `expected = balance[last] − balance[first]` and `actual = Σ(amount[1..])`, and if they disagree by more than ±0.01 emit a warning into the import report. (Comparing first/last rather than against `openingBalance` is correct because an imported CSV typically starts mid-history, not from account opening.)

**Files:**
- Modify: `backend/src/transaction-imports/transaction-imports.service.ts`
- Modify: `backend/src/transaction-imports/types.ts` (only if needed — likely not)

- [ ] **Step 3.1: Update the `rowImportHash` call site (now 3 args)**

In `transaction-imports.service.ts:78-81`, change:

```typescript
    const hashed = rows.map((r) => ({
      ...r,
      importHash: rowImportHash(r.date, r.amount, r.description, r.runningBalance),
    }));
```

to:

```typescript
    const hashed = rows.map((r) => ({
      ...r,
      importHash: rowImportHash(r.date, r.amount, r.description),
    }));
```

- [ ] **Step 3.2: Stop writing `runningBalance` in the `createMany` payload**

In `transaction-imports.service.ts` (around line 117-128 — the `tx.transaction.createMany` call), remove the `runningBalance` field from the data mapping. Resulting block:

```typescript
      await tx.transaction.createMany({
        data: hashed.map((r) => ({
          accountId,
          date: new Date(r.date),
          amount: new Prisma.Decimal(r.amount),
          description: r.description,
          importHash: r.importHash,
          importId: importRow.id,
        })),
        skipDuplicates: true,
      });
```

(Keep `importId: importRow.id` — the downstream re-query at line ~152 uses it to distinguish newly-inserted rows from existing duplicates. Do not remove `runningBalance` from `r` itself either — it still flows through `ParsedRow` and we need it in Step 3.3 for validation.)

- [ ] **Step 3.3: Add the balance-arithmetic validation pass**

Right before `const warnings: string[] = [];` (currently line 83), add:

```typescript
    // Read the parsed rows' balance column for validation only. If present and
    // arithmetic doesn't hold (balance[last] - balance[first] vs Σ amount[1..]),
    // emit a warning so the user can spot incomplete/duplicate-source files.
    function computeBalanceMismatch(): string | null {
      const withBalance = rows.filter((r) => r.runningBalance !== null);
      if (withBalance.length < 2) return null;
      // rows are returned in CSV file order, which for CBA-style exports is
      // newest-first; sort chronologically before computing the delta.
      const chrono = [...withBalance].sort((a, b) => a.date.localeCompare(b.date));
      const first = Number(chrono[0].runningBalance);
      const last = Number(chrono[chrono.length - 1].runningBalance);
      const sumAmounts = chrono.slice(1).reduce((acc, r) => acc + Number(r.amount), 0);
      const diff = last - first - sumAmounts;
      if (Math.abs(diff) > 0.01) {
        return `Balance arithmetic mismatch: bank's running balance moved by $${(last - first).toFixed(2)} across ${chrono.length} rows, but the amounts sum to $${sumAmounts.toFixed(2)} (off by $${diff.toFixed(2)}). The file may be incomplete or have duplicate rows.`;
      }
      return null;
    }
    const balanceWarning = computeBalanceMismatch();
```

Then, just after the existing `if (prior) { warnings.unshift(...) }` block (around line 95), append:

```typescript
    if (balanceWarning) warnings.push(balanceWarning);
```

- [ ] **Step 3.4: Build and restart backend**

```bash
docker compose build backend && docker compose up -d backend && docker logs simplebooks-backend-1 -f --tail=30
```

Wait until the log line `Nest application successfully started` appears (~60s). Ctrl-C the log tail. The backend still reads the (now stale) `runningBalance` column on the existing rows, but writes nothing into it. That's fine until Task 6 drops the column.

- [ ] **Step 3.5: Manual smoke test — re-import 2.csv then 3.csv on a clean slate, expect duplicates this time**

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'TRUNCATE "Transaction", "TransactionImport" CASCADE;'
```

Then via the UI (`http://localhost:3000/accounts/0b19e0fc-5043-4b8a-8d91-71dbd4b661d4`):
1. Import `Bank Data/2.csv`. Expected report: 34 imported, 0 dupes.
2. Import `Bank Data/3.csv`. Expected report: **6 duplicates skipped, 17 imported** (since 3.csv has 23 rows and 6 overlap with 2.csv).
3. The sniffer should now correctly map 3.csv as `[date, amount, description, balance]` — verify the column-header dropdowns in the mapping dialog.

Verify in DB:

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'SELECT filename, "rowsImported", "rowsSkippedDup" FROM "TransactionImport" ORDER BY "importedAt";'
```

Expected:
```
 2.csv | 34 | 0
 3.csv | 17 | 6
```

If the duplicate count is still 0, the sniffer mapping is still wrong — re-check Task 1.

- [ ] **Step 3.6: Commit**

```bash
git add backend/src/transaction-imports/transaction-imports.service.ts
git commit -m "$(cat <<'EOF'
feat(import): stop writing runningBalance; validate via balance arithmetic

Per-row balance is now derived from openingBalance + Σ(amount). The
importer continues to parse the CSV's balance column when present, but
uses it only to compute a balance-arithmetic warning when the bank's
running total disagrees with Σ(amount) for the rows in the file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Backend — drop `runningBalance` from sort whitelist

**Files:**
- Modify: `backend/src/transactions/dto.ts` line 4

- [ ] **Step 4.1: Remove `runningBalance` from `VALID_SORT_KEYS`**

In `backend/src/transactions/dto.ts:4`, change:

```typescript
const VALID_SORT_KEYS = ['date', 'amount', 'description', 'runningBalance'] as const;
```

to:

```typescript
const VALID_SORT_KEYS = ['date', 'amount', 'description'] as const;
```

- [ ] **Step 4.2: Verify no other backend code references the old key**

```bash
grep -rn "'runningBalance'\|\"runningBalance\"" /home/reallybasic/Projects/Accounting/backend/src
```

Expected: zero hits (in `backend/src/`). Hits in `prisma/` and other generated paths are fine; column drop comes in Task 6.

- [ ] **Step 4.3: Commit**

```bash
git add backend/src/transactions/dto.ts
git commit -m "$(cat <<'EOF'
chore(transactions): drop runningBalance from sortable-keys whitelist

Balance is no longer stored, so sorting by it has no meaningful semantics.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend — drop `runningBalance` field; compute Balance column locally

**Context:** Transactions list page loads all rows for the account into the client (per CLAUDE.md's "in-memory client-side via FilteredList" pattern). The cumulative sum is cheap. The table will sort rows by `(date ASC, id ASC)`, run a forward cumulative sum from `openingBalance`, attach a synthetic `computedBalance` field, then apply the user's chosen sort for display.

**Files:**
- Modify: `frontend/lib/types.ts:318` — remove `runningBalance?: string | null;` from `Transaction`
- Modify: `frontend/components/transactions/transactions-table.tsx` — replace `runningBalance` reads with locally computed value
- Modify: `frontend/components/transactions/transaction-edit-modal.tsx:146` — drop the Balance row from the modal (computed value would be confusing when one row is open out of context)

- [ ] **Step 5.1: Remove `runningBalance` from the `Transaction` type**

In `frontend/lib/types.ts:318`, delete the line `runningBalance?: string | null;`. Confirm what's left is consistent (no trailing comma issues).

- [ ] **Step 5.2: Drop the Balance row from the edit modal**

In `frontend/components/transactions/transaction-edit-modal.tsx`, find line 146 (`<div className="font-mono text-slate-800">{fmtBalance(transaction.runningBalance)}</div>`) and delete the surrounding row that displays Balance (likely the wrapping `<div>` plus its sibling `<label>` or similar — read 5-10 lines of context around line 146 first to scope correctly).

Also remove the `fmtBalance` import / helper if it becomes unused after this change. Verify:

```bash
grep -n 'fmtBalance' /home/reallybasic/Projects/Accounting/frontend/components/transactions/transaction-edit-modal.tsx
```

- [ ] **Step 5.3: Compute the Balance column locally in the table**

In `frontend/components/transactions/transactions-table.tsx`:

First, in the `SortKey` definition at line 35, remove `"runningBalance"`:

```typescript
type SortKey = "date" | "amount" | "description";
```

Then, in the column definitions around line 354 — keep the column but mark it non-sortable:

```typescript
    { key: "computedBalance", label: "Balance", align: "right", sortable: false, width: "1fr" },
```

Find where the table receives its row data (look for the `transactions` / `items` / `rows` state — it's loaded inside `TransactionsTable` itself via an `api(...)` call; search for `setTransactions` or the initial fetch). Once you've located the rendered row array `transactions`, add this memo just before the JSX return:

```typescript
  const transactionsWithBalance = useMemo(() => {
    // Sort chronologically (oldest first, id-asc as deterministic tiebreaker),
    // running cumulative sum forward from each row's account openingBalance.
    // Returned shape is the same array of transactions with a synthetic
    // `computedBalance` field.
    // Same-day order is arbitrary but deterministic — flagged in docs.
    const openingByAccountId = new Map<string, number>(
      accounts.map((a) => [a.id, Number(a.openingBalance)]),
    );
    const chrono = [...transactions].sort((a, b) => {
      if (a.accountId !== b.accountId) return a.accountId < b.accountId ? -1 : 1;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
    const runningByAccount = new Map<string, number>();
    const balanceById = new Map<string, number>();
    for (const t of chrono) {
      const current = runningByAccount.get(t.accountId) ?? (openingByAccountId.get(t.accountId) ?? 0);
      const next = current + Number(t.amount);
      runningByAccount.set(t.accountId, next);
      balanceById.set(t.id, next);
    }
    return transactions.map((t) => ({
      ...t,
      computedBalance: balanceById.get(t.id) ?? (openingByAccountId.get(t.accountId) ?? 0),
    }));
  }, [transactions, accounts]);
```

(The table already receives `accounts: Account[]` as a prop — see `transactions-table.tsx:103` — and `Account.openingBalance` already exists in `frontend/lib/types.ts:299`. No new props or fetches required. Partitioning by `accountId` makes the `mode="all"` view correct too.)

Replace the existing rendering at lines 630-631 with:

```typescript
                    {`$${Number(t.computedBalance).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
```

(Drop the `!= null` guard — `computedBalance` is always set.)

Wire `transactionsWithBalance` into the table's rendering (replace the `transactions`/`rows` variable used by the row map with `transactionsWithBalance`).

- [ ] **Step 5.4: Rebuild and verify in the browser**

```bash
docker compose build frontend && docker compose up -d frontend
```

Wait ~30s, then in the browser at `http://localhost:3000/accounts/<account-id>`:
1. The Balance column still renders for every row.
2. The newest row's balance equals `openingBalance + Σ(all amount)` — same as the "Current balance" card at the top.
3. The Balance column header is no longer clickable for sort.
4. The transaction edit modal no longer shows a Balance row.

If the balance column shows `$0.00` for every row, the `openingBalance` prop didn't get threaded through — re-check Step 5.3's call-site wiring.

- [ ] **Step 5.5: Commit**

```bash
git add frontend/lib/types.ts frontend/components/transactions/transactions-table.tsx frontend/components/transactions/transaction-edit-modal.tsx
git commit -m "$(cat <<'EOF'
feat(transactions-table): compute Balance column locally from openingBalance

Drops the runningBalance field from the Transaction type. Table sorts rows
chronologically, runs a cumulative sum from the account's openingBalance,
and renders the result. Balance is no longer a sortable column. Edit-modal
Balance row dropped to avoid showing a value that's only correct in
list-context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Schema — drop `Transaction.runningBalance` column

**Context:** This is a destructive schema change. Per CLAUDE.md: column drops require `docker compose down -v` (the entrypoint's `prisma db push --accept-data-loss` does NOT survive column drops on populated tables). All previous tasks have removed every code-side reference, so it's safe to drop now.

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 6.1: Drop the column from the Prisma schema**

In `backend/prisma/schema.prisma`, find the `Transaction` model (around line 416). Delete the `runningBalance Decimal? @db.Decimal(14,2)` line (exact column type may differ — read the model first to confirm).

- [ ] **Step 6.2: Bring the stack down and wipe volumes**

```bash
docker compose down -v
```

(This deletes all dev data. There is no production data to worry about. Seed will re-populate.)

- [ ] **Step 6.3: Bring the stack up and verify schema**

```bash
docker compose up -d
docker logs simplebooks-backend-1 -f --tail=50
```

Wait for `Nest application successfully started`. Then confirm the column is gone:

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c '\d "Transaction"'
```

Expected: no `runningBalance` column in the output.

- [ ] **Step 6.4: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "$(cat <<'EOF'
chore(schema): drop Transaction.runningBalance column

Balance is derived from Account.openingBalance + Σ(Transaction.amount).
Requires docker compose down -v on dev environments.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Documentation

**Files:**
- Modify: `DatabaseSchema.md` — remove the `runningBalance` row from the `Transaction` table description.
- Modify: `modules_and_logic.md` — under the Transactions module, replace any "stored running balance" wording with "balance computed from openingBalance + Σ(amount); same-day ordering tiebreak is `id ASC`".
- Modify: `CLAUDE.md` — under "Known gotchas":
  - Remove or update the line about `Prisma Decimal` columns coming back as strings (still true generally, but ensure no example mentions `runningBalance`).
  - Add a new gotcha: "**Transaction balance is derived, not stored.** The `Transaction.runningBalance` column was dropped on 2026-05-25. Per-row balance is computed frontend-side as `openingBalance + cumulative Σ(amount)` after sorting `(date ASC, id ASC)`. Same-day rows have a deterministic but arbitrary order — the per-row balance for same-day rows may not match what the bank's statement showed. The account-level current balance (sum aggregation) is unaffected."
  - Add a new gotcha: "**Import dedupe hash is `date|amount|normalisedDesc`** (no balance). Changing this formula will make every existing transaction's hash mismatch any re-import, which would trigger duplicate inserts — don't tweak it casually."

- [ ] **Step 7.1: Update DatabaseSchema.md**

Open `DatabaseSchema.md`, find the `Transaction` model section, delete the `runningBalance` row. Verify the surrounding table is still well-formed.

- [ ] **Step 7.2: Update modules_and_logic.md**

```bash
grep -n 'runningBalance\|Running balance\|running balance' /home/reallybasic/Projects/Accounting/modules_and_logic.md
```

Replace each occurrence per the wording in the Task 7 context above. If none exist, add a one-line note under the Transactions section: "Per-row Balance is computed (not stored) — see CLAUDE.md gotchas."

- [ ] **Step 7.3: Update CLAUDE.md known-gotchas**

Add the two new gotcha bullets listed in the Task 7 context. Place them near the existing "Invoice payment columns are denormalised" gotcha, since both describe denormalisation policy.

- [ ] **Step 7.4: Commit**

```bash
git add DatabaseSchema.md modules_and_logic.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: Transaction.runningBalance dropped — balance now derived

Updates DatabaseSchema, modules_and_logic, and CLAUDE.md known-gotchas
to reflect that per-row balance is computed (not stored) and that the
import hash formula changed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: End-to-end verification

**Goal:** Reproduce the original failing test from this conversation (2.csv + 3.csv → 6 duplicates expected, 0 detected) and confirm it now passes.

- [ ] **Step 8.1: Clean DB state**

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'TRUNCATE "Transaction", "TransactionImport" CASCADE;'
```

- [ ] **Step 8.2: Import 2.csv via the UI**

Navigate to `http://localhost:3000/accounts/<CBA-Smart-Access-id>`, click Import CSV, choose `Bank Data/2.csv`, confirm mapping (should auto-detect `[date, amount, description, balance]`), click Import.

Expected report: **Total 34 / Imported 34 / Duplicates 0 / Failed 0**.

- [ ] **Step 8.3: Import 3.csv via the UI**

Repeat for `Bank Data/3.csv`. **Verify in the mapping dialog** that the sniffer now suggests `[date, amount, description, balance]` (not the swapped `[date, balance, description, amount]` it suggested before Task 1).

Expected report: **Total 23 / Imported 17 / Duplicates 6 / Failed 0**, with the 6 duplicates listed individually with "view existing" links to their 2.csv-originating counterparts.

- [ ] **Step 8.4: Confirm DB state**

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'SELECT filename, "rowsImported", "rowsSkippedDup" FROM "TransactionImport" ORDER BY "importedAt"; SELECT COUNT(*) AS total FROM "Transaction";'
```

Expected:
```
 2.csv | 34 | 0
 3.csv | 17 | 6
 total | 51
```

- [ ] **Step 8.5: Confirm transactions-table Balance column matches account current balance**

On the account detail page, the newest row's computed Balance value must equal the "Current balance" card. If they differ, the cumulative sum direction is wrong (Step 5.3) — fix and rebuild frontend.

- [ ] **Step 8.6: Spot-check balance-mismatch warning**

Hand-craft a tiny invalid CSV in the Files panel (e.g. drop a middle row from `2.csv` so the balance jumps don't add up) and import it. Expect a warning in the import-complete dialog reading something like *"Balance arithmetic mismatch: bank's running balance moved by $X across N rows, but the amounts sum to $Y (off by $Z). The file may be incomplete or have duplicate rows."*

If the warning doesn't appear when expected, Step 3.3's threshold or arithmetic is wrong — investigate.

- [ ] **Step 8.7: No commit** — verification only.

---

## Rollback notes

If anything goes catastrophically wrong after Task 6:

```bash
git revert <task-6-commit-sha> <task-5-commit-sha> <task-4-commit-sha> <task-3-commit-sha> <task-2-commit-sha>
docker compose down -v && docker compose up -d
```

Tasks 1 and 7 are safe to keep in any rollback (sniffer improvement and docs).
