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
