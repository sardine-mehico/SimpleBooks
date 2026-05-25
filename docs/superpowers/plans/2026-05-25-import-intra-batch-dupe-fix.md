# Import — fix intra-batch silent-drop bug (ordinal hash + post-insert sanity check) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the CSV importer from silently dropping rows that share the same `(date, amount, normalisedDesc)` with another row in the same file, AND surface a loud failure if any drop ever happens again from another cause.

**Architecture:** Change `rowImportHash` to take an `ordinal` argument; assign ordinals per same-key group within the input batch (1st occurrence = 1, 2nd = 2, …). All N identical rows in a file now produce N distinct hashes (`H|1 … H|N`) and all land. After `createMany`, the service compares `hashed.length` to `actuallyLanded.count` for the new `importId`; if they differ, throw — that's a bug worth screaming about. Re-importing the same file produces the same hash SET, so dedupe against prior imports still works.

**Tech Stack:** NestJS 10 + Prisma + PostgreSQL backend, Jest (ts-jest) + a hand-rolled `run()` harness for `*.test.ts` files in `backend/src/transaction-imports/`.

---

## Pre-flight

Before Task 1, run these once to capture the baseline.

```bash
# Confirm the touchpoints we're about to edit
grep -n "rowImportHash" /home/reallybasic/Projects/Accounting/backend/src/transaction-imports/*.ts
grep -n "importHash\|@@unique" /home/reallybasic/Projects/Accounting/backend/prisma/schema.prisma
```

Expected:
- 3 hits in backend src: `hash.ts` (export), `hash.ts` (no, only the export line — see step), `transaction-imports.service.ts:80` (call site).
- `Transaction.importHash` is `String`, `@@unique([accountId, importHash])`.

**Heads-up for the executor:** the existing `rowImportHash(date, amount, description)` formula is used by previously-imported rows in any dev DB. The new formula `rowImportHash(date, amount, description, ordinal)` produces different hashes. Mitigation: a one-shot `TRUNCATE Transaction, TransactionImport CASCADE` is part of Task 6's verification. The user has accepted this (their DB is a dev env and they've truncated multiple times already).

---

## File map

**Files to modify:**
- `backend/src/transaction-imports/hash.ts` — add `ordinal` parameter to `rowImportHash`.
- `backend/src/transaction-imports/hash.test.ts` — new tests for ordinal behaviour.
- `backend/src/transaction-imports/ordinals.ts` — **new** pure helper: `assignOrdinals(rows): Array<row & {ordinal: number}>`.
- `backend/src/transaction-imports/ordinals.test.ts` — **new** tests for the pure helper.
- `backend/src/transaction-imports/transaction-imports.service.ts` — call `assignOrdinals` before computing hashes; add post-insert sanity check that throws on mismatch.
- `CLAUDE.md` — update the "Import dedupe hash is `date|amount|normalisedDesc`" gotcha to note the ordinal extension and the post-insert invariant.

**Files to NOT touch:**
- `backend/prisma/schema.prisma` — schema unchanged; the unique index `@@unique([accountId, importHash])` stays. We just feed it different hash strings.
- `frontend/components/transaction-imports/*` — no UI change; existing report sections (Imported / Duplicates / Failed) still work because the per-row counts will now be accurate.
- `backend/src/transaction-imports/csv-parser.service.ts` — parser unchanged. It still produces `ParsedRow[]`; ordinals are assigned downstream.

---

## Task 1: Pure ordinal-assignment helper (TDD)

**Context:** Sort the input rows by `(date, amount.toFixed(2), normaliseDesc(description), originalIndex)` and walk through, assigning each row an ordinal that counts its 1-based position within its `(date, amount, desc)` group. Originalindex is the tiebreaker so the assignment is deterministic. The function MUST be pure (no I/O, no Prisma) so it can be unit-tested in isolation.

**Files:**
- Create: `backend/src/transaction-imports/ordinals.ts`
- Create: `backend/src/transaction-imports/ordinals.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `backend/src/transaction-imports/ordinals.test.ts`:

```typescript
import { strict as assert } from 'node:assert';
import { assignOrdinals } from './ordinals';
import type { ParsedRow } from './types';

function run(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); console.error(e); process.exitCode = 1; }
}

function row(date: string, amount: string, description: string): ParsedRow {
  return { date, amount, description, runningBalance: null };
}

run('Single unique row gets ordinal 1', () => {
  const out = assignOrdinals([row('2024-11-25', '667.33', 'M RESIDENTIAL')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].ordinal, 1);
});

run('Three identical rows get ordinals 1, 2, 3', () => {
  const out = assignOrdinals([
    row('2024-11-25', '667.33', 'M RESIDENTIAL'),
    row('2024-11-25', '667.33', 'M RESIDENTIAL'),
    row('2024-11-25', '667.33', 'M RESIDENTIAL'),
  ]);
  assert.deepEqual(out.map((r) => r.ordinal), [1, 2, 3]);
});

run('Mixed groups: ordinals reset per group, not globally', () => {
  const out = assignOrdinals([
    row('2024-01-01', '10.00', 'A'),
    row('2024-01-02', '20.00', 'B'),
    row('2024-01-01', '10.00', 'A'),
    row('2024-01-02', '20.00', 'B'),
    row('2024-01-02', '20.00', 'B'),
  ]);
  // Two A's get [1,2], three B's get [1,2,3]
  const byDesc = new Map<string, number[]>();
  for (const r of out) {
    const k = r.description;
    if (!byDesc.has(k)) byDesc.set(k, []);
    byDesc.get(k)!.push(r.ordinal);
  }
  assert.deepEqual(byDesc.get('A')?.sort(), [1, 2]);
  assert.deepEqual(byDesc.get('B')?.sort(), [1, 2, 3]);
});

run('Description normalisation collapses to same group', () => {
  // "FOO  BAR" and "foo bar" should normalise to the same key per normaliseDesc.
  const out = assignOrdinals([
    row('2024-01-01', '5.00', 'FOO  BAR'),
    row('2024-01-01', '5.00', 'foo bar'),
  ]);
  assert.deepEqual(out.map((r) => r.ordinal).sort(), [1, 2]);
});

run('Amount equality uses toFixed(2)', () => {
  // "10" and "10.00" must be the same group.
  const out = assignOrdinals([
    row('2024-01-01', '10', 'X'),
    row('2024-01-01', '10.00', 'X'),
  ]);
  assert.deepEqual(out.map((r) => r.ordinal).sort(), [1, 2]);
});

run('Empty input returns empty output', () => {
  const out = assignOrdinals([]);
  assert.deepEqual(out, []);
});

run('Original row order is preserved in the output array', () => {
  // Output must have the same indices as input — only the `ordinal` field is added.
  const r1 = row('2024-02-01', '99.00', 'Z');
  const r2 = row('2024-01-01', '11.00', 'A');
  const r3 = row('2024-01-01', '11.00', 'A');
  const out = assignOrdinals([r1, r2, r3]);
  assert.equal(out[0].description, 'Z');
  assert.equal(out[1].description, 'A');
  assert.equal(out[2].description, 'A');
});
```

- [ ] **Step 1.2: Run tests to confirm all fail (file doesn't exist)**

```bash
docker cp /home/reallybasic/Projects/Accounting/backend/src/transaction-imports/ordinals.test.ts simplebooks-backend-1:/app/src/transaction-imports/
docker exec simplebooks-backend-1 sh -c 'cd /app && npx ts-node --compiler-options "{\"module\":\"commonjs\",\"esModuleInterop\":true,\"target\":\"ES2022\"}" src/transaction-imports/ordinals.test.ts' 2>&1
```

Expected: compile error `Cannot find module './ordinals'`. That's "the failing test" for this TDD step.

- [ ] **Step 1.3: Write the implementation**

Create `backend/src/transaction-imports/ordinals.ts`:

```typescript
import { normaliseDesc } from './csv-parser.service';
import type { ParsedRow } from './types';

/**
 * Assigns a 1-based ordinal to each row indicating its position within
 * its (date|amount|normalisedDesc) group. Used by the import hash to
 * distinguish otherwise-identical rows in the same file (e.g. a bank
 * crediting the same amount from the same payer 11 times in one day).
 *
 * Returns rows in the same order as the input (only the `ordinal` field
 * is added). The ordinal-assignment order within a group is the rows'
 * original input order — deterministic for a given input.
 */
export function assignOrdinals<R extends ParsedRow>(
  rows: R[],
): Array<R & { ordinal: number }> {
  const groupCounts = new Map<string, number>();
  return rows.map((r) => {
    const amount = Number(r.amount).toFixed(2);
    const key = `${r.date}|${amount}|${normaliseDesc(r.description)}`;
    const next = (groupCounts.get(key) ?? 0) + 1;
    groupCounts.set(key, next);
    return { ...r, ordinal: next };
  });
}
```

- [ ] **Step 1.4: Run tests to confirm all pass**

```bash
docker cp /home/reallybasic/Projects/Accounting/backend/src/transaction-imports/ordinals.ts simplebooks-backend-1:/app/src/transaction-imports/
docker cp /home/reallybasic/Projects/Accounting/backend/src/transaction-imports/ordinals.test.ts simplebooks-backend-1:/app/src/transaction-imports/
docker exec simplebooks-backend-1 sh -c 'cd /app && npx ts-node --compiler-options "{\"module\":\"commonjs\",\"esModuleInterop\":true,\"target\":\"ES2022\"}" src/transaction-imports/ordinals.test.ts'
```

Expected: 7 PASS lines, 0 FAIL, `EXIT=0`.

- [ ] **Step 1.5: Commit**

```bash
git -C /home/reallybasic/Projects/Accounting add backend/src/transaction-imports/ordinals.ts backend/src/transaction-imports/ordinals.test.ts
git -C /home/reallybasic/Projects/Accounting commit -m "$(cat <<'EOF'
feat(import-ordinals): per-row ordinal assignment within same-key groups

Pure helper that walks the parsed rows and stamps a 1-based ordinal on
each one. Identical (date|amount|normalisedDesc) rows get [1, 2, 3, …]
so they later produce distinct importHashes and all land instead of
being silently merged by the unique index.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `rowImportHash` signature with ordinal

**Context:** Today the hash is `sha256(date | amount.toFixed(2) | normaliseDesc(description))`. After this task it becomes `sha256(date | amount.toFixed(2) | normaliseDesc(description) | ordinal)`. The ordinal is always present in the hash input. Single-occurrence rows always get ordinal `1`, so a hash for a unique row is now `sha256(... | 1)` — a different string from what's currently stored on existing rows in any dev DB. Task 6 handles the truncate.

**Files:**
- Modify: `backend/src/transaction-imports/hash.ts`
- Create: `backend/src/transaction-imports/hash.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `backend/src/transaction-imports/hash.test.ts`:

```typescript
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { rowImportHash } from './hash';
import { normaliseDesc } from './csv-parser.service';

function run(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); console.error(e); process.exitCode = 1; }
}

function expectedHash(date: string, amount: string, desc: string, ordinal: number): string {
  const payload = [date, amount, normaliseDesc(desc), String(ordinal)].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

run('Hash includes ordinal in payload', () => {
  const got = rowImportHash('2024-11-25', '667.33', 'M RESIDENTIAL', 1);
  const want = expectedHash('2024-11-25', '667.33', 'M RESIDENTIAL', 1);
  assert.equal(got, want);
});

run('Same row with different ordinals produces different hashes', () => {
  const h1 = rowImportHash('2024-11-25', '667.33', 'M RESIDENTIAL', 1);
  const h2 = rowImportHash('2024-11-25', '667.33', 'M RESIDENTIAL', 2);
  const h3 = rowImportHash('2024-11-25', '667.33', 'M RESIDENTIAL', 11);
  assert.notEqual(h1, h2);
  assert.notEqual(h2, h3);
  assert.notEqual(h1, h3);
});

run('Same inputs produce same hash (deterministic)', () => {
  const a = rowImportHash('2024-11-25', '667.33', 'M RESIDENTIAL', 5);
  const b = rowImportHash('2024-11-25', '667.33', 'M RESIDENTIAL', 5);
  assert.equal(a, b);
});

run('Description normalisation is applied before hashing', () => {
  const h1 = rowImportHash('2024-01-01', '5.00', 'FOO  BAR', 1);
  const h2 = rowImportHash('2024-01-01', '5.00', 'foo bar', 1);
  assert.equal(h1, h2);
});
```

- [ ] **Step 2.2: Run test to confirm it fails (compile error: too many args)**

```bash
docker cp /home/reallybasic/Projects/Accounting/backend/src/transaction-imports/hash.test.ts simplebooks-backend-1:/app/src/transaction-imports/
docker exec simplebooks-backend-1 sh -c 'cd /app && npx ts-node --compiler-options "{\"module\":\"commonjs\",\"esModuleInterop\":true,\"target\":\"ES2022\"}" src/transaction-imports/hash.test.ts' 2>&1 | head -20
```

Expected: TS error `Expected 3 arguments, but got 4` on the `rowImportHash(..., 1)` calls. That's the failing test.

- [ ] **Step 2.3: Add the ordinal parameter to `rowImportHash`**

Replace `backend/src/transaction-imports/hash.ts` lines 1-17 entirely:

```typescript
import { createHash } from 'node:crypto';
import { normaliseDesc } from './csv-parser.service';

// sha256 of date|amount.toFixed(2)|normaliseDesc(description)|ordinal.
// `ordinal` is the row's 1-based position within its (date|amount|desc)
// group in the input batch — single occurrences are always ordinal 1.
// Including it lets N identical rows in a single file produce N distinct
// hashes so all land instead of being silently merged by the unique
// index. See ordinals.ts for assignment logic.
//
// runningBalance is NOT in the hash — balance is derived (openingBalance
// + Σ amount) and not stored on Transaction.
export function rowImportHash(
  date: string,
  amount: string,
  description: string,
  ordinal: number,
): string {
  const payload = [date, amount, normaliseDesc(description), String(ordinal)].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function fileSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
```

(The `fileSha256` function is preserved — it's used by the file-level "already imported" check, unrelated to per-row hashing.)

- [ ] **Step 2.4: Run hash tests — expect all 4 PASS**

```bash
docker cp /home/reallybasic/Projects/Accounting/backend/src/transaction-imports/hash.ts simplebooks-backend-1:/app/src/transaction-imports/
docker exec simplebooks-backend-1 sh -c 'cd /app && npx ts-node --compiler-options "{\"module\":\"commonjs\",\"esModuleInterop\":true,\"target\":\"ES2022\"}" src/transaction-imports/hash.test.ts'
```

Expected: 4 PASS, 0 FAIL.

- [ ] **Step 2.5: Verify nothing else compiles against the old 3-arg signature**

```bash
grep -rn 'rowImportHash' /home/reallybasic/Projects/Accounting/backend/src
```

Expected: hits in `hash.ts` (export + tests) and `transaction-imports.service.ts:80`. The call site in the service is currently `rowImportHash(r.date, r.amount, r.description)` — 3 args — which will FAIL to compile. Task 3 updates it.

- [ ] **Step 2.6: Commit (backend will not boot cleanly until Task 3 lands — expected)**

```bash
git -C /home/reallybasic/Projects/Accounting add backend/src/transaction-imports/hash.ts backend/src/transaction-imports/hash.test.ts
git -C /home/reallybasic/Projects/Accounting commit -m "$(cat <<'EOF'
refactor(import-hash): add ordinal parameter to rowImportHash

Hash payload now ends with the row's 1-based ordinal within its
(date|amount|desc) group. Single-occurrence rows always get ordinal 1.
Identical rows in the same file get ordinals 1, 2, 3, … and therefore
distinct hashes — they all land instead of being silently dropped by
the unique index.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire ordinals into the importer call site + post-insert sanity check

**Context:** Two changes to `transaction-imports.service.ts`:

1. Call `assignOrdinals` on the parsed rows BEFORE computing hashes, so `rowImportHash` gets the right ordinal per row.
2. After `createMany`, count actual landed rows for this importId. If `landedCount !== hashed.length - alreadyExistingCount`, throw a `BadRequestException` with diagnostic info. This is the safety-net guardrail: even after the ordinal fix, if something else ever drops rows silently (constraint violation, future schema change, etc.), the import fails loudly instead of reporting bogus counts.

**Files:**
- Modify: `backend/src/transaction-imports/transaction-imports.service.ts` lines 78-90 and 138-175

- [ ] **Step 3.1: Import `assignOrdinals` and apply ordinals before hashing**

In `backend/src/transaction-imports/transaction-imports.service.ts`, add to the imports block at the top of the file (find the existing `import { fileSha256, rowImportHash } from './hash';` line and add the new import directly after it):

```typescript
import { assignOrdinals } from './ordinals';
```

Then find the existing block at line ~78:

```typescript
    const hashed = rows.map((r) => ({
      ...r,
      importHash: rowImportHash(r.date, r.amount, r.description),
    }));
```

Replace it with:

```typescript
    const withOrdinals = assignOrdinals(rows);
    const hashed = withOrdinals.map((r) => ({
      ...r,
      importHash: rowImportHash(r.date, r.amount, r.description, r.ordinal),
    }));
```

- [ ] **Step 3.2: Add the post-insert sanity check**

In the same file, find the block that follows `await tx.transaction.createMany(...)` (currently at lines ~138-148). Right after that `createMany` call ends — and BEFORE the existing re-query block (`const justInserted = await tx.transaction.findMany(...)`, currently line ~151) — insert:

```typescript
      // Sanity check: after createMany with skipDuplicates, the number of rows
      // with this importId equals the number of distinct hashes in our batch
      // that were not already in the DB. If those don't match, rows were
      // silently dropped — fail loudly rather than report bogus counts.
      const landedForThisImport = await tx.transaction.count({
        where: { importId: importRow.id },
      });
      const batchHashes = new Set(hashed.map((r) => r.importHash));
      const preexisting = await tx.transaction.count({
        where: {
          accountId,
          importHash: { in: Array.from(batchHashes) },
          NOT: { importId: importRow.id },
        },
      });
      const expectedLanded = batchHashes.size - preexisting;
      if (landedForThisImport !== expectedLanded) {
        throw new BadRequestException(
          `Import sanity check failed: expected ${expectedLanded} rows to land ` +
          `(${batchHashes.size} distinct hashes in batch minus ${preexisting} ` +
          `already in DB) but ${landedForThisImport} actually landed for importId ` +
          `${importRow.id}. This means rows were silently dropped by the database. ` +
          `The import has been rolled back.`,
        );
      }
```

The `throw` inside a Prisma `$transaction` callback causes the whole transaction (including the `transactionImport.create` row) to roll back, so a failed sanity check leaves the DB exactly as it was before the import attempt.

- [ ] **Step 3.3: Rebuild backend and confirm it boots**

```bash
docker compose -f /home/reallybasic/Projects/Accounting/docker-compose.yml build backend && docker compose -f /home/reallybasic/Projects/Accounting/docker-compose.yml up -d backend
timeout 90 docker logs -f --tail=30 simplebooks-backend-1 2>&1 | sed '/Nest application successfully started/q'
```

Expected: backend reaches `Nest application successfully started`. If it fails to compile, recheck Steps 3.1 and 3.2.

- [ ] **Step 3.4: Commit**

```bash
git -C /home/reallybasic/Projects/Accounting add backend/src/transaction-imports/transaction-imports.service.ts
git -C /home/reallybasic/Projects/Accounting commit -m "$(cat <<'EOF'
fix(import): use ordinal-aware hashes + post-insert sanity check

Calls assignOrdinals on parsed rows before hashing so identical rows
get distinct importHashes and all land. After createMany, compares the
actual landed count against (distinct-hashes-in-batch minus
already-in-DB); throws BadRequestException if they differ, rolling
back the entire import transaction. This is the safety net for any
future cause of silent drops (constraint violations, schema changes,
etc.) so the importer fails loudly instead of reporting bogus counts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: End-to-end verification with Book1.csv

**Context:** Truncate, re-import `Book1.csv`, then check that all 11 M RESIDENTIAL rows land. The previously-observed import bug ("4923 imported / 0 duplicates" reported but DB only had 4903 rows) should be gone — the report should now show 4923 imported / 0 duplicates AND the DB should actually contain 4923 rows. The current balance on the account should equal `$253.82 + $10,602.17 = $10,855.99`.

**Files:** none — verification only.

- [ ] **Step 4.1: Truncate transactions and import logs**

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'TRUNCATE "Transaction", "TransactionImport" CASCADE;'
```

Confirm:

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'SELECT COUNT(*) AS tx FROM "Transaction"; SELECT COUNT(*) AS imp FROM "TransactionImport";'
```

Expected: both `0`.

- [ ] **Step 4.2: Import Book1.csv via the API (faster than the UI for a 4923-row file)**

The account ID for `CBA Smart Access` is `190e8e81-1fb6-46a6-9747-ac4754a29bc7` (verify with `docker exec simplebooks-postgres-1 psql -U accounting -d accounting -tAc "SELECT id FROM \"Account\" WHERE name = 'CBA Smart Access';"` if the seed re-ran for any reason). The mapping is `[date, description, debit, credit]` — Book1.csv's column order.

```bash
ACCOUNT=190e8e81-1fb6-46a6-9747-ac4754a29bc7
FILE=/home/reallybasic/Projects/Accounting/Bank\ Data/Book1.csv

# Sniff
SNIFF=$(curl -s -X POST "http://localhost:4000/transaction-imports/sniff" \
  -F "accountId=$ACCOUNT" \
  -F "file=@$FILE")
SHA=$(echo "$SNIFF" | python3 -c "import json,sys; print(json.load(sys.stdin)['fileSha256'])")
echo "sha256 = $SHA"

# Mapping override (Debit/Credit split, not the sniffer's auto-detection — Book1.csv has no Balance column)
MAPPING='{"hasHeader":true,"dateFormat":"DD/MM/YYYY","columns":["date","description","debit","credit"]}'

# Commit
REPORT=$(curl -s -X POST "http://localhost:4000/transaction-imports/commit" \
  -F "accountId=$ACCOUNT" \
  -F "fileSha256=$SHA" \
  -F "filename=Book1.csv" \
  -F "applyRules=false" \
  -F "mapping=$MAPPING" \
  -F "file=@$FILE")
echo "$REPORT" | python3 -m json.tool | head -30
```

Expected `counts` field: `{ total: 4923, imported: 4923, duplicates: 0, failed: 0 }`.

- [ ] **Step 4.3: Verify the actual DB row count matches the report**

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'SELECT COUNT(*) AS actual_rows FROM "Transaction" WHERE "accountId" = '"'"'190e8e81-1fb6-46a6-9747-ac4754a29bc7'"'"';'
```

Expected: `4923`. (Before this fix it was 4903. The 20-row gap is closed.)

- [ ] **Step 4.4: Verify all 11 M RESIDENTIAL rows landed**

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c "SELECT COUNT(*) AS m_residential_count FROM \"Transaction\" WHERE date = '2024-11-25' AND description LIKE '%MRESIDENTIAL%';"
```

Expected: `11`. (Before this fix it was 1.)

- [ ] **Step 4.5: Verify the current account balance**

```bash
curl -s "http://localhost:4000/accounts/190e8e81-1fb6-46a6-9747-ac4754a29bc7" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"current balance: {d['currentBalance']}\")"
```

Expected: `10855.99` (give or take rounding — the previously-computed value of `$253.82 + $10,602.17`).

- [ ] **Step 4.6: No commit — verification only**

---

## Task 5: Regression test for the sanity-check throw

**Context:** Make sure the sanity check actually trips when it should. The simplest way to force it is to monkey-test against a Postgres trigger that drops rows. But that's fragile. Instead, we test the inverse: a normal import does NOT throw. The throw path is exercised in code review by tracing the math — we accept that as good enough for a guardrail that we hope never fires.

If the executor wants extra confidence, an integration test could mock `tx.transaction.count` to return a wrong value and assert the throw. That's optional and not required for this plan.

- [ ] **Step 5.1: Spot-check the importer still works on a simple non-duplicate file (e.g. 1.csv from earlier in the conversation)**

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'TRUNCATE "Transaction", "TransactionImport" CASCADE;'
ACCOUNT=190e8e81-1fb6-46a6-9747-ac4754a29bc7
FILE=/home/reallybasic/Projects/Accounting/Bank\ Data/1.csv

SNIFF=$(curl -s -X POST "http://localhost:4000/transaction-imports/sniff" -F "accountId=$ACCOUNT" -F "file=@$FILE")
SHA=$(echo "$SNIFF" | python3 -c "import json,sys; print(json.load(sys.stdin)['fileSha256'])")
MAPPING=$(echo "$SNIFF" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['suggestedMapping']['mapping']))")

curl -s -X POST "http://localhost:4000/transaction-imports/commit" \
  -F "accountId=$ACCOUNT" -F "fileSha256=$SHA" -F "filename=1.csv" -F "applyRules=false" \
  -F "mapping=$MAPPING" -F "file=@$FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['counts'])"
```

Expected: `{'total': 15, 'imported': 15, 'duplicates': 0, 'failed': 0}`. No exception thrown.

- [ ] **Step 5.2: Re-import the same file — confirm all 15 are correctly detected as duplicates (no false sanity-check failure)**

```bash
SNIFF=$(curl -s -X POST "http://localhost:4000/transaction-imports/sniff" -F "accountId=$ACCOUNT" -F "file=@$FILE")
SHA=$(echo "$SNIFF" | python3 -c "import json,sys; print(json.load(sys.stdin)['fileSha256'])")
MAPPING=$(echo "$SNIFF" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['suggestedMapping']['mapping']))")

curl -s -X POST "http://localhost:4000/transaction-imports/commit" \
  -F "accountId=$ACCOUNT" -F "fileSha256=$SHA" -F "filename=1.csv" -F "applyRules=false" \
  -F "mapping=$MAPPING" -F "file=@$FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['counts'])"
```

Expected: `{'total': 15, 'imported': 0, 'duplicates': 15, 'failed': 0}`. Confirms the sanity check (`expectedLanded = 0` since all 15 hashes are already in DB; `landedForThisImport = 0`; no throw).

- [ ] **Step 5.3: Re-import Book1.csv after the 1.csv truncate-then-import to set up the full E2E from Task 4**

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'TRUNCATE "Transaction", "TransactionImport" CASCADE;'
FILE=/home/reallybasic/Projects/Accounting/Bank\ Data/Book1.csv
SNIFF=$(curl -s -X POST "http://localhost:4000/transaction-imports/sniff" -F "accountId=$ACCOUNT" -F "file=@$FILE")
SHA=$(echo "$SNIFF" | python3 -c "import json,sys; print(json.load(sys.stdin)['fileSha256'])")
MAPPING='{"hasHeader":true,"dateFormat":"DD/MM/YYYY","columns":["date","description","debit","credit"]}'

curl -s -X POST "http://localhost:4000/transaction-imports/commit" \
  -F "accountId=$ACCOUNT" -F "fileSha256=$SHA" -F "filename=Book1.csv" -F "applyRules=false" \
  -F "mapping=$MAPPING" -F "file=@$FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['counts'])"
```

Expected: `{'total': 4923, 'imported': 4923, 'duplicates': 0, 'failed': 0}` AND `SELECT COUNT(*)` shows `4923`.

- [ ] **Step 5.4: No commit — verification only**

---

## Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md` — update the existing dedupe-hash gotcha to reflect the ordinal extension and the post-insert sanity-check invariant.

- [ ] **Step 6.1: Update CLAUDE.md**

Find the existing gotcha bullet that mentions the import hash formula (added in commit `b74be62` per earlier docs work). It currently says something like:

> **Import dedupe hash is `date|amount|normalisedDesc`** (no balance). Changing this formula will make every existing transaction's hash mismatch any re-import, which would trigger duplicate inserts — don't tweak it casually.

Replace it with:

> **Import dedupe hash is `date|amount.toFixed(2)|normalisedDesc|ordinal`** where `ordinal` is the row's 1-based position within its `(date|amount|desc)` group inside the input batch. Single-occurrence rows always get ordinal `1`. Two identical rows in the same file get ordinals 1 and 2 and therefore distinct hashes — both land. Re-importing the same file produces the same hash SET (rows are indistinguishable, so any consistent ordinal assignment yields the same multiset of hashes) and dedupe still works. The importer also runs a post-insert sanity check: it counts rows actually landed for the new `importId` and compares against (distinct-hashes-in-batch minus already-in-DB). If they differ, the import transaction throws and rolls back — surfaces silent drops loudly. Changing the hash formula breaks dedupe for any pre-existing rows; pair any change with `TRUNCATE Transaction, TransactionImport CASCADE` on dev DBs.

- [ ] **Step 6.2: Commit**

```bash
git -C /home/reallybasic/Projects/Accounting add CLAUDE.md
git -C /home/reallybasic/Projects/Accounting commit -m "$(cat <<'EOF'
docs: import-hash gotcha now mentions ordinal + post-insert sanity check

Reflects the ordinal-extension of the dedupe hash and the rollback-on-
silent-drop guardrail added in this branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Rollback notes

If something catastrophically goes wrong after Task 3:

```bash
git -C /home/reallybasic/Projects/Accounting revert <task-3-sha> <task-2-sha>
# Task 1 (ordinals helper) and Task 6 (docs) are safe to keep in any rollback.
docker compose -f /home/reallybasic/Projects/Accounting/docker-compose.yml build backend
docker compose -f /home/reallybasic/Projects/Accounting/docker-compose.yml up -d backend
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c 'TRUNCATE "Transaction", "TransactionImport" CASCADE;'
```

---

## Self-review notes

**Spec coverage:**
- Ordinal hash (root-cause fix) → Tasks 1 + 2 + 3 (assignment + hash signature + wiring).
- Post-insert sanity check (safety net) → Task 3 Step 3.2.
- Re-import idempotency (re-import of same file still dedupes) → Task 5 Steps 5.2 + 5.3.
- User's specific outcome (all 11 M RESIDENTIAL rows land, balance = $10,855.99) → Task 4 Steps 4.4 + 4.5.

**Type consistency:**
- `assignOrdinals<R extends ParsedRow>(rows: R[]): Array<R & { ordinal: number }>` — Task 1.
- `rowImportHash(date, amount, description, ordinal: number): string` — Task 2.
- Call site: `withOrdinals.map((r) => ({ ...r, importHash: rowImportHash(r.date, r.amount, r.description, r.ordinal) }))` — Task 3. `r.ordinal` exists because of the generic constraint.

**Placeholder scan:** clean. Every code step shows the exact code; every verify step shows the exact command and expected output.

**Known limitation:** if the bank re-exports the file with rows in a different order AND a duplicate group's rows are interleaved differently (so the rowIndex tiebreaker shifts the ordinal assignment), the hashes for individual rows in that group change. But since rows in the same group are indistinguishable by definition, the SET of hashes is identical, so dedupe against the prior import still works. This is verified mentally; could be locked in with a test if a later concern surfaces.
