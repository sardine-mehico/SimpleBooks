import { strict as assert } from 'node:assert';
import { rowImportHash } from './hash';

function run(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); console.error(e); process.exitCode = 1; }
}

run('Hash includes ordinal in payload (golden value)', () => {
  // Golden: sha256("2024-11-25|667.33|m residential|1")
  // Recompute with: echo -n "2024-11-25|667.33|m residential|1" | sha256sum
  const got = rowImportHash('2024-11-25', '667.33', 'M RESIDENTIAL', 1);
  assert.equal(got, '92509273e53497d801639bef7cf992ad2fe90c494b883df0555eca5d35eaf3fd');
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
