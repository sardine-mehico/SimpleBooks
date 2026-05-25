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
