# Banking Phase B — Plan Part 2 (Tasks 6-10)

Continuation of [2026-05-22-banking-phase-b.md](./2026-05-22-banking-phase-b.md). The engine itself is the heart of Phase B — three of the five tasks here build it.

---

## Task 6: Backend — Pure matchers (rule-matcher + vendor-matcher) + tests

**Files:**
- Create: `backend/src/rule-engine/types.ts`
- Create: `backend/src/rule-engine/vendor-matcher.ts`
- Create: `backend/src/rule-engine/rule-matcher.ts`
- Create: `backend/src/rule-engine/matchers.test.ts`

- [ ] **Step 1: Create shared types**

`backend/src/rule-engine/types.ts`:

```ts
// Shared types for the engine. These mirror Prisma row shapes (with the
// fields the matcher actually needs) and the EngineOutput shape consumed by
// both the bulk re-categorise endpoint and the Test Rules sandbox.

export type EngineTransactionInput = {
  id: string;            // for synthesised rows from CSV uploads, use a stable string like `csv:${idx}`
  date: string;          // YYYY-MM-DD
  amount: string;        // signed decimal as string
  description: string;
  accountId: string;     // empty string for CSV-source rows
  vendorId: string | null;
  hasSplits: boolean;
};

export type EngineVendor = {
  id: string;
  name: string;
  aliases: string[];
  isActive: boolean;
};

export type EngineRuleCondition = {
  field: 'DESCRIPTION' | 'AMOUNT' | 'VENDOR' | 'ACCOUNT';
  operator: 'CONTAINS' | 'EQUALS' | 'STARTS_WITH' | 'ENDS_WITH' | 'GT' | 'LT' | 'BETWEEN' | 'IN';
  value: string;
  value2: string | null;
  valueList: string[];
};

export type EngineRule = {
  id: string;
  name: string;
  state: 'USER' | 'AI_DRAFTED' | 'APPROVED' | 'DENIED';
  isActive: boolean;
  priority: number;
  categoryId: string;
  categoryName: string;   // populated by the engine before calling matchRules
  vendorId: string | null;
  noteOnApply: string | null;
  conditions: EngineRuleCondition[];
};

export type EngineRowResult = {
  transactionId: string;
  date: string;
  amount: string;
  description: string;
  vendorMatch: { vendorId: string; vendorName: string } | null;
  vendorMatchAmbiguous: boolean;
  ruleMatch: { ruleId: string; ruleName: string; priority: number; categoryId: string; categoryName: string } | null;
  allMatchingRules: Array<{ ruleId: string; ruleName: string; priority: number }>;
  skipped: 'has-splits' | 'no-rule-match' | null;
};

export type EngineOutput = {
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

// Description normalisation — case-insensitive whitespace-collapsed.
export function normaliseDesc(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 2: Write the failing test for both matchers**

`backend/src/rule-engine/matchers.test.ts`:

```ts
import { strict as assert } from 'node:assert';
import { matchVendor } from './vendor-matcher';
import { matchRules, allConditionsMatch } from './rule-matcher';
import { EngineRule, EngineTransactionInput, EngineVendor } from './types';

function run(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); console.error(e); process.exitCode = 1; }
}

// ──── Vendor matcher tests ────────────────────────────────────────────────

const VENDORS: EngineVendor[] = [
  { id: 'v-paypal', name: 'PayPal', aliases: ['paypal', '617704'], isActive: true },
  { id: 'v-rac',    name: 'RAC',    aliases: ['rac ', 'raci ', '250930'], isActive: true },
  { id: 'v-dyson',  name: 'DYSON',  aliases: ['dyson appliances'], isActive: true },
  { id: 'v-bp',     name: 'BP',     aliases: ['bp ', 'bp australia'], isActive: true },
  { id: 'v-off',    name: 'Inactive', aliases: ['inactivevendor'], isActive: false },
];

run('vendor matcher: exact substring match', () => {
  const r = matchVendor('Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603', VENDORS);
  assert.ok(r); assert.equal(r!.vendor.name, 'PayPal'); assert.equal(r!.ambiguous, false);
});

run('vendor matcher: trailing-space alias prevents false-positive', () => {
  // "racing" should NOT match "rac " (alias has trailing space).
  const r = matchVendor('horse racing club fees', VENDORS);
  assert.equal(r, null);
});

run('vendor matcher: case-insensitive', () => {
  const r = matchVendor('DiReCt CrEdIt DYSON APPLIANCES 2000', VENDORS);
  assert.ok(r); assert.equal(r!.vendor.name, 'DYSON');
});

run('vendor matcher: multiple aliases on same vendor — still single match', () => {
  // RAC has aliases ['rac ', 'raci ', '250930']; description matches both 'raci' and '250930'.
  // Both belong to the same vendor → not ambiguous.
  const r = matchVendor('Direct Debit 250930 RACI 9835350867', VENDORS);
  assert.ok(r); assert.equal(r!.vendor.name, 'RAC'); assert.equal(r!.ambiguous, false);
});

run('vendor matcher: ambiguous picks longest alias', () => {
  // Synthetic: "paypal" matches vendor PayPal; add a second vendor with overlapping alias.
  const overlap: EngineVendor[] = [
    { id: 'v-paypal', name: 'PayPal', aliases: ['paypal'], isActive: true },
    { id: 'v-paypal-au', name: 'PayPal AU', aliases: ['paypal australia'], isActive: true },
  ];
  const r = matchVendor('Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603', overlap);
  assert.ok(r);
  // The longer alias 'paypal australia' wins on tiebreak.
  assert.equal(r!.vendor.name, 'PayPal AU');
  assert.equal(r!.ambiguous, true);
});

run('vendor matcher: inactive vendors are skipped', () => {
  const r = matchVendor('something inactivevendor reference', VENDORS);
  assert.equal(r, null);
});

run('vendor matcher: no match returns null', () => {
  const r = matchVendor('Random unmatched description', VENDORS);
  assert.equal(r, null);
});

// ──── Rule matcher tests ──────────────────────────────────────────────────

function tx(overrides: Partial<EngineTransactionInput> = {}): EngineTransactionInput {
  return {
    id: 't1', date: '2026-05-08', amount: '-1750.00',
    description: 'Transfer To Mani Dawa Friend Maddington', accountId: 'a1', vendorId: null, hasSplits: false,
    ...overrides,
  };
}

function rule(id: string, name: string, priority: number, conditions: any[], extras: Partial<EngineRule> = {}): EngineRule {
  return {
    id, name, state: 'USER', isActive: true, priority,
    categoryId: 'c1', categoryName: 'Test category', vendorId: null, noteOnApply: null,
    conditions: conditions.map((c) => ({ value2: null, valueList: [], ...c })),
    ...extras,
  };
}

run('rule matcher: description CONTAINS (case-insensitive, whitespace-normalised)', () => {
  const r = rule('r1', 'mani', 1000, [{ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'Mani  Dawa' }]);
  assert.equal(allConditionsMatch(tx(), r), true);
});

run('rule matcher: AND-only — all conditions required', () => {
  const r = rule('r1', 'rent', 1000, [
    { field: 'DESCRIPTION', operator: 'CONTAINS', value: 'office rent' },
    { field: 'AMOUNT', operator: 'EQUALS', value: '-55.00' },
  ]);
  assert.equal(allConditionsMatch(tx({ description: 'office rent Danny', amount: '-55.00' }), r), true);
  assert.equal(allConditionsMatch(tx({ description: 'office rent Danny', amount: '-56.00' }), r), false);
  assert.equal(allConditionsMatch(tx({ description: 'something else',     amount: '-55.00' }), r), false);
});

run('rule matcher: AMOUNT GT / LT', () => {
  const rGt = rule('r1', 'big', 1000, [{ field: 'AMOUNT', operator: 'GT', value: '1000' }]);
  assert.equal(allConditionsMatch(tx({ amount: '1500.00' }), rGt), true);
  assert.equal(allConditionsMatch(tx({ amount: '999.00' }), rGt), false);

  const rLt = rule('r1', 'neg', 1000, [{ field: 'AMOUNT', operator: 'LT', value: '0' }]);
  assert.equal(allConditionsMatch(tx({ amount: '-1.00' }), rLt), true);
  assert.equal(allConditionsMatch(tx({ amount: '0.00' }), rLt), false);
});

run('rule matcher: AMOUNT BETWEEN', () => {
  const r = rule('r1', 'mid', 1000, [{ field: 'AMOUNT', operator: 'BETWEEN', value: '-100', value2: '-50' }]);
  assert.equal(allConditionsMatch(tx({ amount: '-75.00' }), r), true);
  assert.equal(allConditionsMatch(tx({ amount: '-101.00' }), r), false);
  assert.equal(allConditionsMatch(tx({ amount: '-49.00' }), r), false);
});

run('rule matcher: VENDOR EQUALS / IN', () => {
  const rEq = rule('r1', 'vendor1', 1000, [{ field: 'VENDOR', operator: 'EQUALS', value: 'v-paypal' }]);
  assert.equal(allConditionsMatch(tx({ vendorId: 'v-paypal' }), rEq), true);
  assert.equal(allConditionsMatch(tx({ vendorId: 'v-other' }), rEq), false);

  const rIn = rule('r1', 'vendor-in', 1000, [{ field: 'VENDOR', operator: 'IN', value: '', valueList: ['v-paypal', 'v-rac'] }]);
  assert.equal(allConditionsMatch(tx({ vendorId: 'v-rac' }), rIn), true);
  assert.equal(allConditionsMatch(tx({ vendorId: 'v-other' }), rIn), false);
});

run('rule matcher: ACCOUNT EQUALS', () => {
  const r = rule('r1', 'acc', 1000, [{ field: 'ACCOUNT', operator: 'EQUALS', value: 'a1' }]);
  assert.equal(allConditionsMatch(tx({ accountId: 'a1' }), r), true);
  assert.equal(allConditionsMatch(tx({ accountId: 'a2' }), r), false);
});

run('matchRules: priority winner (lower priority = higher precedence)', () => {
  const txn = tx({ description: 'office rent Danny', amount: '-55.00' });
  const broad   = rule('r-broad', 'Personal', 1010, [{ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'Danny' }]);
  const narrow  = rule('r-narrow', 'Office rent', 1000, [
    { field: 'DESCRIPTION', operator: 'CONTAINS', value: 'Danny' },
    { field: 'AMOUNT', operator: 'EQUALS', value: '-55.00' },
  ]);
  const result = matchRules(txn, [broad, narrow]);
  assert.equal(result.winner?.ruleId, 'r-narrow', 'narrow should win on lower priority');
  assert.equal(result.allMatching.length, 2);
});

run('matchRules: inactive rules are skipped', () => {
  const txn = tx({ description: 'office rent Danny', amount: '-55.00' });
  const off = rule('r-off', 'Off rule', 1000, [{ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'Danny' }], { isActive: false });
  const on  = rule('r-on', 'On rule', 1010, [{ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'Danny' }]);
  const result = matchRules(txn, [off, on]);
  assert.equal(result.winner?.ruleId, 'r-on');
});

run('matchRules: DENIED rules are skipped even if isActive', () => {
  const txn = tx({ description: 'foo' });
  const denied = rule('r-d', 'd', 1000, [{ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'foo' }], { state: 'DENIED' });
  const result = matchRules(txn, [denied]);
  assert.equal(result.winner, null);
});

run('matchRules: no match → winner is null', () => {
  const txn = tx({ description: 'xyz' });
  const r = rule('r1', 'r1', 1000, [{ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'abc' }]);
  const result = matchRules(txn, [r]);
  assert.equal(result.winner, null);
  assert.equal(result.allMatching.length, 0);
});
```

- [ ] **Step 3: Implement vendor matcher**

`backend/src/rule-engine/vendor-matcher.ts`:

```ts
import { EngineVendor, normaliseDesc } from './types';

export function matchVendor(
  description: string,
  vendors: EngineVendor[],
): { vendor: EngineVendor; ambiguous: boolean } | null {
  const haystack = normaliseDesc(description);
  type Hit = { vendor: EngineVendor; aliasLength: number };
  const hits: Hit[] = [];
  for (const v of vendors) {
    if (!v.isActive) continue;
    let bestAliasLen = 0;
    for (const alias of v.aliases) {
      const a = alias.toLowerCase();
      if (a.length === 0) continue;
      if (haystack.includes(a)) {
        if (a.length > bestAliasLen) bestAliasLen = a.length;
      }
    }
    if (bestAliasLen > 0) hits.push({ vendor: v, aliasLength: bestAliasLen });
  }
  if (hits.length === 0) return null;
  // Pick the vendor with the longest matching alias as tiebreaker.
  hits.sort((a, b) => b.aliasLength - a.aliasLength);
  return { vendor: hits[0].vendor, ambiguous: hits.length > 1 };
}
```

- [ ] **Step 4: Implement rule matcher**

`backend/src/rule-engine/rule-matcher.ts`:

```ts
import { EngineRule, EngineRuleCondition, EngineTransactionInput, normaliseDesc } from './types';

const APPROXIMATE_EPSILON = 0.005;  // dollars

function conditionMatches(tx: EngineTransactionInput, c: EngineRuleCondition): boolean {
  const v = c.value;
  switch (c.field) {
    case 'DESCRIPTION': {
      const hay = normaliseDesc(tx.description);
      const needle = normaliseDesc(v);
      switch (c.operator) {
        case 'CONTAINS':    return hay.includes(needle);
        case 'EQUALS':      return hay === needle;
        case 'STARTS_WITH': return hay.startsWith(needle);
        case 'ENDS_WITH':   return hay.endsWith(needle);
        default: return false;
      }
    }
    case 'AMOUNT': {
      const amt = Number(tx.amount);
      const target = Number(v);
      switch (c.operator) {
        case 'EQUALS':  return Math.abs(amt - target) < APPROXIMATE_EPSILON;
        case 'GT':      return amt > target;
        case 'LT':      return amt < target;
        case 'BETWEEN': {
          const upper = Number(c.value2 ?? '');
          if (Number.isNaN(upper)) return false;
          return amt >= target && amt <= upper;
        }
        default: return false;
      }
    }
    case 'VENDOR': {
      if (tx.vendorId === null) return false;
      switch (c.operator) {
        case 'EQUALS': return tx.vendorId === v;
        case 'IN':     return c.valueList.includes(tx.vendorId);
        default: return false;
      }
    }
    case 'ACCOUNT': {
      switch (c.operator) {
        case 'EQUALS': return tx.accountId === v;
        case 'IN':     return c.valueList.includes(tx.accountId);
        default: return false;
      }
    }
  }
}

export function allConditionsMatch(tx: EngineTransactionInput, rule: EngineRule): boolean {
  if (rule.conditions.length === 0) return false;  // a rule with zero conditions never matches (defensive)
  return rule.conditions.every((c) => conditionMatches(tx, c));
}

function isEngineActive(r: EngineRule): boolean {
  return (r.state === 'USER' || r.state === 'APPROVED') && r.isActive;
}

export type RuleMatchResult = {
  winner: { ruleId: string; ruleName: string; priority: number; categoryId: string; categoryName: string } | null;
  allMatching: Array<{ ruleId: string; ruleName: string; priority: number }>;
};

export function matchRules(tx: EngineTransactionInput, rules: EngineRule[]): RuleMatchResult {
  const sorted = rules.filter(isEngineActive).sort((a, b) => a.priority - b.priority);
  const allMatching: RuleMatchResult['allMatching'] = [];
  let winner: RuleMatchResult['winner'] = null;
  for (const r of sorted) {
    if (allConditionsMatch(tx, r)) {
      if (winner === null) {
        winner = { ruleId: r.id, ruleName: r.name, priority: r.priority, categoryId: r.categoryId, categoryName: r.categoryName };
      }
      allMatching.push({ ruleId: r.id, ruleName: r.name, priority: r.priority });
    }
  }
  return { winner, allMatching };
}
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
cd backend && docker build --target build -t simplebooks-backend-test . > /dev/null 2>&1
docker run --rm simplebooks-backend-test npx ts-node src/rule-engine/matchers.test.ts
```

Expected: 14 PASS lines (7 vendor matcher + 7 rule matcher).

- [ ] **Step 6: Commit**

```bash
git add backend/src/rule-engine
git commit -m "feat(banking): pure rule + vendor matchers with comprehensive tests"
```

---

## Task 7: Backend — Rule-engine orchestrator + CategorisationEvent writes

**Files:**
- Create: `backend/src/rule-engine/rule-engine.service.ts`
- Create: `backend/src/rule-engine/rule-engine.module.ts`

- [ ] **Step 1: Implement orchestrator service**

`backend/src/rule-engine/rule-engine.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { matchRules } from './rule-matcher';
import { matchVendor } from './vendor-matcher';
import {
  EngineOutput,
  EngineRowResult,
  EngineRule,
  EngineRuleCondition,
  EngineTransactionInput,
  EngineVendor,
} from './types';

export interface EngineInput {
  transactionIds?: string[];
  filter?: {
    accountIds?: string[];
    dateFrom?: string;
    dateTo?: string;
    scope: 'uncategorised' | 'all';
  };
  // CSV-source rows for the sandbox (skips DB load of transactions).
  csvRows?: Array<{ date: string; amount: string; description: string }>;
  ruleIds?: string[];          // empty = all engine-active rules
  preserveSplits: boolean;
  applyVendorMatch: boolean;
  applyRules: boolean;
  dryRun: boolean;
}

@Injectable()
export class RuleEngineService {
  constructor(private prisma: PrismaService) {}

  async run(input: EngineInput): Promise<EngineOutput> {
    // ---- Load reference data: vendors, rules ----
    const vendors = await this.prisma.vendor.findMany({
      where: { isActive: true },
      select: { id: true, name: true, aliases: true, isActive: true },
    });
    const engineVendors: EngineVendor[] = vendors.map((v) => ({
      id: v.id, name: v.name, aliases: v.aliases, isActive: v.isActive,
    }));

    let ruleRows = await this.prisma.rule.findMany({
      where: input.ruleIds?.length
        ? { id: { in: input.ruleIds } }
        : {},
      include: {
        conditions: { orderBy: { position: 'asc' } },
        category: { select: { id: true, name: true } },
      },
      orderBy: { priority: 'asc' },
    });
    const engineRules: EngineRule[] = ruleRows.map((r) => ({
      id: r.id, name: r.name,
      state: r.state as EngineRule['state'],
      isActive: r.isActive, priority: r.priority,
      categoryId: r.categoryId, categoryName: r.category.name,
      vendorId: r.vendorId, noteOnApply: r.noteOnApply,
      conditions: r.conditions.map<EngineRuleCondition>((c) => ({
        field: c.field as EngineRuleCondition['field'],
        operator: c.operator as EngineRuleCondition['operator'],
        value: c.value, value2: c.value2, valueList: c.valueList,
      })),
    }));

    // ---- Load transactions ----
    let txInputs: EngineTransactionInput[];
    let txRecordById: Map<string, { id: string; categoryId: string | null; vendorId: string | null; notes: string | null }>;
    if (input.csvRows) {
      // Sandbox CSV mode — synthesised rows; no DB.
      txInputs = input.csvRows.map((r, i) => ({
        id: `csv:${i}`,
        date: r.date, amount: r.amount, description: r.description,
        accountId: '', vendorId: null, hasSplits: false,
      }));
      txRecordById = new Map();
    } else {
      const where: any = {};
      if (input.transactionIds?.length) where.id = { in: input.transactionIds };
      if (input.filter) {
        if (input.filter.accountIds?.length) where.accountId = { in: input.filter.accountIds };
        if (input.filter.dateFrom || input.filter.dateTo) {
          where.date = {};
          if (input.filter.dateFrom) where.date.gte = new Date(input.filter.dateFrom);
          if (input.filter.dateTo) where.date.lte = new Date(input.filter.dateTo);
        }
        if (input.filter.scope === 'uncategorised') where.categoryId = null;
      }
      const rows = await this.prisma.transaction.findMany({
        where,
        select: {
          id: true, date: true, amount: true, description: true, accountId: true,
          vendorId: true, categoryId: true, notes: true,
          _count: { select: { splits: true } },
        },
      });
      txInputs = rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        amount: r.amount.toString(),
        description: r.description,
        accountId: r.accountId,
        vendorId: r.vendorId,
        hasSplits: r._count.splits > 0,
      }));
      txRecordById = new Map(rows.map((r) => [r.id, { id: r.id, categoryId: r.categoryId, vendorId: r.vendorId, notes: r.notes }]));
    }

    // ---- Compute per-row results ----
    const results: EngineRowResult[] = [];
    let preservedSplitsCount = 0;
    let vendorMatchedCount = 0;
    let ruleMatchedCount = 0;
    const perRuleCount = new Map<string, { ruleName: string; count: number }>();

    for (const tx of txInputs) {
      const result: EngineRowResult = {
        transactionId: tx.id,
        date: tx.date, amount: tx.amount, description: tx.description,
        vendorMatch: null, vendorMatchAmbiguous: false,
        ruleMatch: null, allMatchingRules: [], skipped: null,
      };

      // Pass 1: vendor match.
      if (input.applyVendorMatch) {
        const vm = matchVendor(tx.description, engineVendors);
        if (vm) {
          result.vendorMatch = { vendorId: vm.vendor.id, vendorName: vm.vendor.name };
          result.vendorMatchAmbiguous = vm.ambiguous;
          tx.vendorId = vm.vendor.id;   // make available to rule conditions
        }
      }

      if (tx.hasSplits && input.preserveSplits) {
        result.skipped = 'has-splits';
        preservedSplitsCount++;
        results.push(result);
        continue;
      }

      // Pass 2: rule match.
      if (input.applyRules) {
        const rm = matchRules(tx, engineRules);
        result.ruleMatch = rm.winner;
        result.allMatchingRules = rm.allMatching;
        if (!rm.winner) result.skipped = 'no-rule-match';
      }

      if (result.vendorMatch && txRecordById.get(tx.id)?.vendorId !== result.vendorMatch.vendorId) {
        vendorMatchedCount++;
      }
      if (result.ruleMatch) {
        ruleMatchedCount++;
        const prev = perRuleCount.get(result.ruleMatch.ruleId);
        if (prev) prev.count++;
        else perRuleCount.set(result.ruleMatch.ruleId, { ruleName: result.ruleMatch.ruleName, count: 1 });
      }
      results.push(result);
    }

    // ---- Apply + log (skip when dryRun or csvRows) ----
    if (!input.dryRun && !input.csvRows) {
      await this.applyResults(results, txRecordById, engineRules);
    }

    const output: EngineOutput = {
      rows: results,
      stats: {
        total: results.length,
        vendorMatched: vendorMatchedCount,
        ruleMatched: ruleMatchedCount,
        preservedSplits: preservedSplitsCount,
        unchanged: results.filter((r) => !r.vendorMatch && !r.ruleMatch && !r.skipped).length,
        perRule: Array.from(perRuleCount.entries()).map(([ruleId, v]) => ({
          ruleId, ruleName: v.ruleName, count: v.count,
        })),
      },
    };
    return output;
  }

  private async applyResults(
    results: EngineRowResult[],
    txRecordById: Map<string, { id: string; categoryId: string | null; vendorId: string | null; notes: string | null }>,
    engineRules: EngineRule[],
  ) {
    const ruleById = new Map(engineRules.map((r) => [r.id, r]));
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const perRuleDelta = new Map<string, number>();

      for (const r of results) {
        const orig = txRecordById.get(r.transactionId);
        if (!orig) continue;

        // Vendor update.
        if (r.vendorMatch && orig.vendorId !== r.vendorMatch.vendorId) {
          await tx.transaction.update({ where: { id: orig.id }, data: { vendorId: r.vendorMatch.vendorId } });
          await tx.categorisationEvent.create({
            data: {
              transactionId: orig.id,
              source: 'VENDOR_MATCH',
              oldVendorId: orig.vendorId,
              newVendorId: r.vendorMatch.vendorId,
            },
          });
          orig.vendorId = r.vendorMatch.vendorId;
        }

        // Rule update.
        if (r.ruleMatch) {
          const winningRule = ruleById.get(r.ruleMatch.ruleId);
          const newCategoryId = r.ruleMatch.categoryId;
          if (orig.categoryId !== newCategoryId) {
            let updatedNotes = orig.notes;
            if (winningRule?.noteOnApply) {
              updatedNotes = orig.notes
                ? `${orig.notes}\n${winningRule.noteOnApply}`
                : winningRule.noteOnApply;
            }
            await tx.transaction.update({
              where: { id: orig.id },
              data: {
                categoryId: newCategoryId,
                ruleId: r.ruleMatch.ruleId,
                categorisedAt: now,
                notes: updatedNotes,
              },
            });
            await tx.categorisationEvent.create({
              data: {
                transactionId: orig.id,
                source: 'RULE',
                ruleId: r.ruleMatch.ruleId,
                oldCategoryId: orig.categoryId,
                newCategoryId,
              },
            });
            perRuleDelta.set(r.ruleMatch.ruleId, (perRuleDelta.get(r.ruleMatch.ruleId) ?? 0) + 1);
          }
        }
      }

      // Update Rule.hitCount + lastFiredAt for fired rules.
      for (const [ruleId, delta] of perRuleDelta) {
        await tx.rule.update({
          where: { id: ruleId },
          data: { hitCount: { increment: delta }, lastFiredAt: now },
        });
      }
    });
  }
}
```

- [ ] **Step 2: Create the module**

`backend/src/rule-engine/rule-engine.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RuleEngineService } from './rule-engine.service';

@Module({
  providers: [RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
```

(The controller is added in Task 9.)

- [ ] **Step 3: Register in app.module.ts**

Add `RuleEngineModule` to imports.

- [ ] **Step 4: Rebuild and confirm boot**

```bash
docker compose build backend && docker compose up -d backend
sleep 8
docker logs simplebooks-backend-1 --tail 20
```

Expected: `Nest application successfully started`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/rule-engine
git commit -m "feat(banking): rule-engine orchestrator with two-pass + CategorisationEvent log"
```

---

## Task 8: Backend — Transaction splits endpoints

**Files:**
- Modify: `backend/src/transactions/transactions.controller.ts`
- Modify: `backend/src/transactions/transactions.service.ts`
- Modify: `backend/src/transactions/dto.ts`

- [ ] **Step 1: Add split DTOs**

Append to `backend/src/transactions/dto.ts`:

```ts
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';

export class SplitItemDto {
  @IsUUID() categoryId!: string;
  @Type(() => Number) @IsNumber() amount!: number;
  @IsString() @IsOptional() @MaxLength(500) notes?: string;
}

export class SetSplitsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SplitItemDto) splits!: SplitItemDto[];
}

export class SetCategoryDto {
  @IsUUID() @IsOptional() categoryId?: string;
  @IsUUID() @IsOptional() vendorId?: string;
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
}
```

- [ ] **Step 2: Add split methods to service**

Append to `backend/src/transactions/transactions.service.ts` (inside the class):

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// ... existing methods ...

async setSplits(transactionId: string, splits: Array<{ categoryId: string; amount: number; notes?: string }>) {
  const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!tx) throw new NotFoundException();
  const expected = Number(tx.amount);
  const total = splits.reduce((acc, s) => acc + Number(s.amount), 0);
  if (Math.abs(expected - total) > 0.005) {
    throw new BadRequestException(`Splits sum ($${total.toFixed(2)}) must equal transaction amount ($${expected.toFixed(2)}).`);
  }
  return this.prisma.$transaction(async (db) => {
    await db.transactionSplit.deleteMany({ where: { transactionId } });
    for (let i = 0; i < splits.length; i++) {
      await db.transactionSplit.create({
        data: {
          transactionId,
          categoryId: splits[i].categoryId,
          amount: new Prisma.Decimal(splits[i].amount),
          notes: splits[i].notes ?? null,
          position: i,
        },
      });
    }
    // Clear single-row categoryId — splits are now the source of truth.
    await db.transaction.update({
      where: { id: transactionId },
      data: { categoryId: null, ruleId: null, categorisedAt: new Date() },
    });
    await db.categorisationEvent.create({
      data: {
        transactionId,
        source: 'USER',
        oldCategoryId: tx.categoryId,
        newCategoryId: null,
      },
    });
    return this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { splits: { include: { category: true }, orderBy: { position: 'asc' } } },
    });
  });
}

async clearSplits(transactionId: string) {
  const tx = await this.prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { splits: { orderBy: { amount: 'desc' } } },
  });
  if (!tx) throw new NotFoundException();
  if (tx.splits.length === 0) return tx;
  const restoreCategoryId = tx.splits[0].categoryId;  // largest split's category becomes the single category
  return this.prisma.$transaction(async (db) => {
    await db.transactionSplit.deleteMany({ where: { transactionId } });
    await db.transaction.update({
      where: { id: transactionId },
      data: { categoryId: restoreCategoryId, categorisedAt: new Date() },
    });
    await db.categorisationEvent.create({
      data: {
        transactionId, source: 'USER',
        oldCategoryId: null, newCategoryId: restoreCategoryId,
      },
    });
    return db.transaction.findUnique({ where: { id: transactionId } });
  });
}

async setCategory(transactionId: string, data: { categoryId?: string; vendorId?: string; notes?: string }) {
  const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!tx) throw new NotFoundException();
  return this.prisma.$transaction(async (db) => {
    const updated = await db.transaction.update({
      where: { id: transactionId },
      data: {
        categoryId: data.categoryId === undefined ? undefined : data.categoryId,
        vendorId: data.vendorId === undefined ? undefined : data.vendorId,
        notes: data.notes === undefined ? undefined : data.notes,
        categorisedAt: data.categoryId !== undefined ? new Date() : undefined,
        ruleId: data.categoryId !== undefined ? null : undefined,  // manual change unlinks from rule
      },
    });
    if (data.categoryId !== undefined && data.categoryId !== tx.categoryId) {
      await db.categorisationEvent.create({
        data: {
          transactionId, source: 'USER',
          oldCategoryId: tx.categoryId, newCategoryId: data.categoryId,
        },
      });
    }
    if (data.vendorId !== undefined && data.vendorId !== tx.vendorId) {
      await db.categorisationEvent.create({
        data: {
          transactionId, source: 'USER',
          oldVendorId: tx.vendorId, newVendorId: data.vendorId,
        },
      });
    }
    return updated;
  });
}
```

- [ ] **Step 3: Add controller endpoints**

In `backend/src/transactions/transactions.controller.ts`, add:

```ts
import { Body, Delete, Param, Patch, Post } from '@nestjs/common';
import { SetCategoryDto, SetSplitsDto } from './dto';

// In the controller class:
@Post(':id/splits') setSplits(@Param('id') id: string, @Body() dto: SetSplitsDto) {
  return this.service.setSplits(id, dto.splits);
}
@Delete(':id/splits') clearSplits(@Param('id') id: string) {
  return this.service.clearSplits(id);
}
@Patch(':id/category') setCategory(@Param('id') id: string, @Body() dto: SetCategoryDto) {
  return this.service.setCategory(id, dto);
}
```

- [ ] **Step 4: Rebuild and probe (no transactions yet to split — just confirm 404 path)**

```bash
docker compose build backend && docker compose up -d backend
sleep 8
curl -s -o /dev/stderr -w 'set-splits on missing txn: HTTP %{http_code}\n' \
  -X POST http://localhost:4000/transactions/00000000-0000-0000-0000-000000000000/splits \
  -H 'content-type: application/json' \
  -d '{"splits":[{"categoryId":"00000000-0000-0000-0000-000000000000","amount":1.00}]}'
```

Expected: HTTP 404.

- [ ] **Step 5: Commit**

```bash
git add backend/src/transactions
git commit -m "feat(banking): transaction splits + setCategory endpoints with event log"
```

---

## Task 9: Backend — Rule-engine endpoints (recategorise + test)

**Files:**
- Create: `backend/src/rule-engine/rule-engine.controller.ts`
- Create: `backend/src/rule-engine/dto.ts`
- Modify: `backend/src/rule-engine/rule-engine.module.ts`

- [ ] **Step 1: Create DTOs**

`backend/src/rule-engine/dto.ts`:

```ts
import { IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RecategoriseDto {
  @IsIn(['uncategorised', 'all']) scope!: 'uncategorised' | 'all';
  @IsArray() @IsOptional() @IsUUID('all', { each: true }) accountIds?: string[];
  @IsISO8601() @IsOptional() dateFrom?: string;
  @IsISO8601() @IsOptional() dateTo?: string;
  @IsBoolean() @IsOptional() preserveSplits?: boolean;     // default true
  @IsBoolean() @IsOptional() applyVendorMatch?: boolean;   // default true
}

class TestCsvRowDto {
  @IsString() date!: string;
  @IsString() amount!: string;
  @IsString() description!: string;
}

export class TestRulesDto {
  @IsIn(['existing', 'csv']) source!: 'existing' | 'csv';
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => TestCsvRowDto) csvRows?: TestCsvRowDto[];
  @IsArray() @IsOptional() @IsUUID('all', { each: true }) accountIds?: string[];
  @IsISO8601() @IsOptional() dateFrom?: string;
  @IsISO8601() @IsOptional() dateTo?: string;
  @IsArray() @IsOptional() @IsUUID('all', { each: true }) ruleIds?: string[];
  @IsBoolean() @IsOptional() applyVendorMatch?: boolean;   // default true
}
```

- [ ] **Step 2: Create the controller**

`backend/src/rule-engine/rule-engine.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { RuleEngineService } from './rule-engine.service';
import { RecategoriseDto, TestRulesDto } from './dto';

@Controller('rule-engine')
export class RuleEngineController {
  constructor(private engine: RuleEngineService) {}

  @Post('recategorise')
  @HttpCode(200)
  recategorise(@Body() dto: RecategoriseDto) {
    return this.engine.run({
      filter: {
        scope: dto.scope,
        accountIds: dto.accountIds,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
      },
      preserveSplits: dto.preserveSplits ?? true,
      applyVendorMatch: dto.applyVendorMatch ?? true,
      applyRules: true,
      dryRun: false,
    });
  }

  @Post('test')
  @HttpCode(200)
  test(@Body() dto: TestRulesDto) {
    return this.engine.run({
      filter: dto.source === 'existing'
        ? { scope: 'all', accountIds: dto.accountIds, dateFrom: dto.dateFrom, dateTo: dto.dateTo }
        : undefined,
      csvRows: dto.source === 'csv' ? dto.csvRows : undefined,
      ruleIds: dto.ruleIds,
      preserveSplits: true,
      applyVendorMatch: dto.applyVendorMatch ?? true,
      applyRules: true,
      dryRun: true,
    });
  }
}
```

- [ ] **Step 3: Register controller in module**

Update `backend/src/rule-engine/rule-engine.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RuleEngineController } from './rule-engine.controller';
import { RuleEngineService } from './rule-engine.service';

@Module({
  controllers: [RuleEngineController],
  providers: [RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
```

- [ ] **Step 4: Rebuild and probe both endpoints**

```bash
docker compose build backend && docker compose up -d backend
sleep 8

# Test endpoint with no rules / no transactions returns empty.
curl -s -X POST http://localhost:4000/rule-engine/test -H 'content-type: application/json' \
  -d '{"source":"existing"}' | python3 -m json.tool | head -10

# Recategorise endpoint with no rules returns empty too.
curl -s -X POST http://localhost:4000/rule-engine/recategorise -H 'content-type: application/json' \
  -d '{"scope":"uncategorised"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['stats'])"
```

Expected: both return `{rows: [], stats: {total: 0, ...}}`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/rule-engine
git commit -m "feat(banking): rule-engine recategorise + test endpoints"
```

---

## Task 10: Backend — Wire engine into CSV import "Categorise based on rules" path

**Files:**
- Modify: `backend/src/transaction-imports/transaction-imports.service.ts`
- Modify: `backend/src/transaction-imports/transaction-imports.controller.ts`
- Modify: `backend/src/transaction-imports/transaction-imports.module.ts`
- Modify: `backend/src/transaction-imports/dto.ts`
- Modify: `backend/src/transaction-imports/types.ts` (extend ImportReport)

- [ ] **Step 1: Extend ImportReport type**

Append to `backend/src/transaction-imports/types.ts`:

```ts
export interface ImportRuleCategorisation {
  enabled: boolean;
  vendorMatched: number;
  ruleMatched: number;
  perRule: Array<{ ruleId: string; ruleName: string; categoryName: string; count: number }>;
  ambiguousVendor: number;
}
```

Modify the existing `ImportReport` interface to add an optional field at the end:

```ts
export interface ImportReport {
  // ... existing fields ...
  ruleCategorisation?: ImportRuleCategorisation | null;
}
```

- [ ] **Step 2: Extend the DTO with the opt-in flag**

In `backend/src/transaction-imports/dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

// Add to CommitImportDto:
@IsBoolean()
@IsOptional()
@Transform(({ value }) => value === true || value === 'true')
applyRules?: boolean;
```

- [ ] **Step 3: Inject the engine + wire it in commit()**

In `backend/src/transaction-imports/transaction-imports.service.ts`:

```ts
import { RuleEngineService } from '../rule-engine/rule-engine.service';

// Update constructor:
constructor(
  private prisma: PrismaService,
  private engine: RuleEngineService,
) {}
```

After the existing commit() flow (after the `$transaction` returns and the report has been assembled but BEFORE the final write), add:

```ts
// Run rule-engine over just-inserted transactions if opt-in flag is set.
let ruleCategorisation: ImportRuleCategorisation | null = null;
if (applyRules && importedRows.length > 0) {
  // Look up the actual transaction IDs that were inserted in this import.
  const insertedTransactions = await this.prisma.transaction.findMany({
    where: { importId: importRow.id },
    select: { id: true },
  });
  const txIds = insertedTransactions.map((t) => t.id);
  const engineResult = await this.engine.run({
    transactionIds: txIds,
    preserveSplits: true,
    applyVendorMatch: true,
    applyRules: true,
    dryRun: false,
  });
  // Build summary for the report.
  const ambiguousVendor = engineResult.rows.filter((r) => r.vendorMatchAmbiguous).length;
  // Get per-rule with categoryName (engineResult.stats.perRule has just ruleId+ruleName+count).
  const ruleCategoryMap = new Map<string, { categoryName: string }>();
  for (const r of engineResult.rows) {
    if (r.ruleMatch && !ruleCategoryMap.has(r.ruleMatch.ruleId)) {
      ruleCategoryMap.set(r.ruleMatch.ruleId, { categoryName: r.ruleMatch.categoryName });
    }
  }
  ruleCategorisation = {
    enabled: true,
    vendorMatched: engineResult.stats.vendorMatched,
    ruleMatched: engineResult.stats.ruleMatched,
    perRule: engineResult.stats.perRule.map((p) => ({
      ...p,
      categoryName: ruleCategoryMap.get(p.ruleId)?.categoryName ?? '',
    })),
    ambiguousVendor,
  };
}

// Add to the report assembly:
report.ruleCategorisation = ruleCategorisation;
```

Note: this assumes the existing `commit()` method has `applyRules` available as a parameter. Add it to the method signature:

```ts
async commit(
  buffer: Buffer,
  accountId: string,
  expectedSha: string,
  mapping: ColumnMapping,
  filename: string,
  applyRules = false,  // NEW: opt-in
): Promise<ImportReport> {
  // ... existing flow ...
}
```

- [ ] **Step 4: Wire applyRules from controller into service**

In `backend/src/transaction-imports/transaction-imports.controller.ts`, update the commit endpoint:

```ts
return this.service.commit(
  file.buffer,
  body.accountId,
  body.fileSha256,
  mapping,
  body.filename ?? file.originalname,
  body.applyRules === true,  // NEW
);
```

- [ ] **Step 5: Register RuleEngineModule in transaction-imports module**

In `backend/src/transaction-imports/transaction-imports.module.ts`:

```ts
import { RuleEngineModule } from '../rule-engine/rule-engine.module';

@Module({
  imports: [RuleEngineModule],
  controllers: [TransactionImportsController],
  providers: [TransactionImportsService],
  exports: [TransactionImportsService],
})
export class TransactionImportsModule {}
```

- [ ] **Step 6: Rebuild and verify with a probe**

```bash
docker compose build backend && docker compose up -d backend
sleep 8

# Need transactions to test against — re-import temp/1.csv with applyRules=false first.
ACCT=$(curl -s http://localhost:4000/accounts | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
SHA=$(curl -s -X POST http://localhost:4000/transaction-imports/sniff \
  -F "file=@/home/reallybasic/Projects/Accounting/temp/1.csv" \
  -F "accountId=$ACCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['fileSha256'])")
MAPPING='{"hasHeader":false,"dateFormat":"DD/MM/YYYY","columns":["date","amount","description","balance"]}'
curl -s -X POST http://localhost:4000/transaction-imports/commit \
  -F "file=@/home/reallybasic/Projects/Accounting/temp/1.csv" \
  -F "accountId=$ACCT" -F "fileSha256=$SHA" -F "mapping=$MAPPING" -F "applyRules=false" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print('counts:', r['counts']); print('ruleCategorisation:', r.get('ruleCategorisation'))"
```

Expected: counts as before; `ruleCategorisation` is `None` / null.

- [ ] **Step 7: Commit**

```bash
git add backend/src/transaction-imports
git commit -m "feat(banking): wire rule-engine into CSV import (applyRules opt-in)"
```

---

End of Part 2. Continuing in [Part 3](./2026-05-22-banking-phase-b-part-3.md).
