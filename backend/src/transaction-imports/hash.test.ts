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
