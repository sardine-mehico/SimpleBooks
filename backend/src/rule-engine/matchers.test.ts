import { strict as assert } from 'node:assert';
import { matchVendor } from './vendor-matcher';
import { matchRules, allConditionsMatch } from './rule-matcher';
import { EngineRule, EngineTransactionInput, EngineVendor } from './types';

function run(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); console.error(e); process.exitCode = 1; }
}

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
  const r = matchVendor('horse racing club fees', VENDORS);
  assert.equal(r, null);
});

run('vendor matcher: case-insensitive', () => {
  const r = matchVendor('DiReCt CrEdIt DYSON APPLIANCES 2000', VENDORS);
  assert.ok(r); assert.equal(r!.vendor.name, 'DYSON');
});

run('vendor matcher: multiple aliases on same vendor — still single match', () => {
  const r = matchVendor('Direct Debit 250930 RACI 9835350867', VENDORS);
  assert.ok(r); assert.equal(r!.vendor.name, 'RAC'); assert.equal(r!.ambiguous, false);
});

run('vendor matcher: ambiguous picks longest alias', () => {
  const overlap: EngineVendor[] = [
    { id: 'v-paypal', name: 'PayPal', aliases: ['paypal'], isActive: true },
    { id: 'v-paypal-au', name: 'PayPal AU', aliases: ['paypal australia'], isActive: true },
  ];
  const r = matchVendor('Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603', overlap);
  assert.ok(r);
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
