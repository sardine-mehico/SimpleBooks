import { strict as assert } from 'node:assert';
import { extractCandidates, normaliseAndTokenise } from './vendor-extractor.service';

function run(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); console.error(e); process.exitCode = 1; }
}

run('normaliseAndTokenise strips noise prefixes', () => {
  const result = normaliseAndTokenise('Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603');
  assert.ok(result.includes('paypal'), 'should contain paypal');
  assert.ok(result.includes('australia'), 'should contain australia');
  assert.ok(!result.includes('direct'), 'should drop direct');
});

run('extractCandidates finds vendor n-grams in CBA-style descriptions', () => {
  const descriptions = [
    'Direct Credit 158824 DYSON APPLIANCES 2000179382',
    'Direct Credit 158824 DYSON APPLIANCES 2000178993',
    'Direct Credit 158824 DYSON APPLIANCES 2000178100',
    'Fast Transfer From DCW Enterprises Pty L DCW 10707',
    'Fast Transfer From DCW Enterprises Pty L DCW 10688',
    'Fast Transfer From DCW Enterprises Pty L DCW 10680',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049954875540',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049756314955',
  ];
  const existing = new Map<string, string>();
  const candidates = extractCandidates(descriptions, existing);
  const names = candidates.map((c) => c.suggestedName.toLowerCase());
  assert.ok(names.some((n) => n.includes('dyson')), `dyson not in ${JSON.stringify(names)}`);
  assert.ok(names.some((n) => n.includes('dcw')), `dcw not in ${JSON.stringify(names)}`);
  assert.ok(names.some((n) => n.includes('paypal')), `paypal not in ${JSON.stringify(names)}`);
});

run('extractCandidates dedups against existing vendor aliases', () => {
  const descriptions = [
    'Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049954875540',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049756314955',
  ];
  const existing = new Map<string, string>();
  existing.set('paypal', 'PayPal');
  const candidates = extractCandidates(descriptions, existing);
  const paypal = candidates.find((c) => c.suggestedName.toLowerCase().includes('paypal'));
  assert.ok(paypal, 'paypal should still appear as candidate');
  assert.equal(paypal!.existsAs, 'PayPal', 'should flag as existing');
});

run('extractCandidates suggests CUSTOMER kind for positive-amount candidates', () => {
  const descriptions = [
    'Direct Credit 158824 DYSON APPLIANCES 2000179382',
    'Direct Credit 158824 DYSON APPLIANCES 2000178993',
    'Direct Credit 158824 DYSON APPLIANCES 2000178100',
  ];
  const amounts = [3854.40, 17344.80, 2000.00];
  const existing = new Map<string, string>();
  const candidates = extractCandidates(descriptions, existing, amounts);
  const dyson = candidates.find((c) => c.suggestedName.toLowerCase().includes('dyson'));
  assert.equal(dyson?.suggestedKind, 'CUSTOMER');
});

run('extractCandidates suggests MERCHANT kind for negative-amount candidates', () => {
  const descriptions = [
    'Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049954875540',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049756314955',
  ];
  const amounts = [-538.43, -399.58, -69.08];
  const existing = new Map<string, string>();
  const candidates = extractCandidates(descriptions, existing, amounts);
  const paypal = candidates.find((c) => c.suggestedName.toLowerCase().includes('paypal'));
  assert.equal(paypal?.suggestedKind, 'MERCHANT');
});
