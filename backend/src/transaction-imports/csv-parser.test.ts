import { strict as assert } from 'node:assert';
import { parseCsv } from './csv-parser.service';
import { ColumnMapping } from './types';

// Style A: signed amount in one column (matches the attached 1.csv / 2.csv / 3.csv).
function styleAMapping(): ColumnMapping {
  return {
    hasHeader: false,
    dateFormat: 'DD/MM/YYYY',
    columns: ['date', 'amount', 'description', 'balance'],
  };
}

// Style B: separate debit and credit columns.
function styleBMapping(): ColumnMapping {
  return {
    hasHeader: true,
    dateFormat: 'DD/MM/YYYY',
    columns: ['date', 'debit', 'credit', 'description'],
  };
}

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

run('Style A — sample line parses to signed amount and ISO date', () => {
  const buf = Buffer.from(
    '09/05/2026,"+422.04","Transfer from DANIEL LIM NetBank HeraldAveFP 10799","+7510.46"\n',
  );
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.parseErrors.length, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].date, '2026-05-09');
  assert.equal(result.rows[0].amount, '422.04');
  assert.equal(result.rows[0].description, 'Transfer from DANIEL LIM NetBank HeraldAveFP 10799');
  assert.equal(result.rows[0].runningBalance, '7510.46');
});

run('Style A — debit row preserves negative sign', () => {
  const buf = Buffer.from('08/05/2026,"-1750.00","Mani Dawa","+7088.42"\n');
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.rows[0].amount, '-1750.00');
});

run('Style A — multiple rows, no header', () => {
  const buf = Buffer.from(
    '09/05/2026,"+422.04","row1","+7510.46"\n08/05/2026,"-1750.00","row2","+7088.42"\n',
  );
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.rows.length, 2);
});

run('Style B — debit/credit collapses to signed amount', () => {
  const buf = Buffer.from(
    'Date,Debit,Credit,Description\n09/05/2026,,422.04,credit row\n08/05/2026,1750.00,,debit row\n',
  );
  const result = parseCsv(buf, styleBMapping());
  assert.equal(result.rows.length, 2);
  // First row (credit): amount should be +422.04
  assert.equal(result.rows[0].amount, '422.04');
  // Second row (debit): amount should be -1750.00
  assert.equal(result.rows[1].amount, '-1750.00');
});

run('Unparseable date goes to parseErrors, not rows', () => {
  const buf = Buffer.from('not-a-date,"+1.00","row","+1.00"\n');
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.rows.length, 0);
  assert.equal(result.parseErrors.length, 1);
  assert.match(result.parseErrors[0].reason, /date/i);
});

run('Date uses local calendar — no UTC round-trip drift', () => {
  // 01/01/2026 in DD/MM/YYYY = 2026-01-01. Must NOT become 2025-12-31.
  const buf = Buffer.from('01/01/2026,"+1.00","new year","+1.00"\n');
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.rows[0].date, '2026-01-01');
});

run('Style A mapping with two amount columns is rejected', () => {
  const bad: ColumnMapping = {
    hasHeader: false,
    dateFormat: 'DD/MM/YYYY',
    columns: ['date', 'amount', 'amount', 'description'],
  };
  assert.throws(() => parseCsv(Buffer.from('01/01/2026,1,2,x\n'), bad), /style|amount/i);
});

run('Mapping with no date column is rejected', () => {
  const bad: ColumnMapping = {
    hasHeader: false,
    dateFormat: 'DD/MM/YYYY',
    columns: ['ignore', 'amount', 'description'],
  };
  assert.throws(() => parseCsv(Buffer.from('a,1.00,x\n'), bad), /date/i);
});

run('Invalid calendar date (Apr 31) is rejected', () => {
  const buf = Buffer.from('31/04/2026,"+1.00","bad","+1.00"\n');
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.rows.length, 0);
  assert.equal(result.parseErrors.length, 1);
  assert.match(result.parseErrors[0].reason, /calendar|real/i);
});

run('Leap-year boundary: 29 Feb 2024 is valid, 29 Feb 2025 is rejected', () => {
  const buf = Buffer.from(
    '29/02/2024,"+1.00","leap","+1.00"\n' +
    '29/02/2025,"+1.00","not-leap","+1.00"\n'
  );
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].date, '2024-02-29');
  assert.equal(result.parseErrors.length, 1);
});
