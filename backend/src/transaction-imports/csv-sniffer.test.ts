import { strict as assert } from 'node:assert';
import { sniffCsv } from './csv-sniffer.service';

function run(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); console.error(e); process.exitCode = 1; }
}

// Exactly the three rows from the attached samples.
const SAMPLE = Buffer.from(
  '09/05/2026,"+422.04","Transfer from DANIEL LIM NetBank HeraldAveFP 10799","+7510.46"\n' +
  '08/05/2026,"-1750.00","Transfer To Mani Dawa","+7088.42"\n' +
  '07/05/2026,"-538.43","Direct Debit PAYPAL AUSTRALIA","+10384.42"\n'
);

run('Sample CSV sniffs as Style A, DD/MM/YYYY, no header, confidence high', () => {
  const s = sniffCsv(SAMPLE);
  assert.equal(s.mapping.hasHeader, false);
  assert.equal(s.mapping.dateFormat, 'DD/MM/YYYY');
  assert.deepEqual(s.mapping.columns, ['date', 'amount', 'description', 'balance']);
  assert.equal(s.confidence, 'high');
});

run('Header row is detected', () => {
  const buf = Buffer.from(
    'Date,Amount,Description,Balance\n09/05/2026,+422.04,foo,+7510.46\n',
  );
  const s = sniffCsv(buf);
  assert.equal(s.mapping.hasHeader, true);
});

run('Style B (debit + credit) detected when no signed column dominates', () => {
  const buf = Buffer.from(
    'Date,Debit,Credit,Description\n01/01/2026,,422.04,row1\n02/01/2026,1750.00,,row2\n03/01/2026,,100.00,row3\n',
  );
  const s = sniffCsv(buf);
  assert.equal(s.mapping.hasHeader, true);
  assert.ok(s.mapping.columns.includes('debit'));
  assert.ok(s.mapping.columns.includes('credit'));
  assert.ok(!s.mapping.columns.includes('amount'));
});

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
