import { Decimal } from '@prisma/client/runtime/library';
import { scoreInvoice, type ScoreTransaction, type ScoreInvoice, type ScoreCustomer } from './scoring';

// Defaults are intentionally non-matching so each "isolation" test only fires
// the signal it overrides — otherwise exactAmount/datePlausible cross-pollute.
function tx(over: Partial<ScoreTransaction> = {}): ScoreTransaction {
  return {
    description: over.description ?? '',
    unallocated: over.unallocated ?? new Decimal('999.99'),
    date: over.date ?? new Date('2024-01-01'),
  };
}

function invoice(over: Partial<ScoreInvoice> = {}): ScoreInvoice {
  return {
    invoiceNumber: over.invoiceNumber ?? 1011,
    amountOutstanding: over.amountOutstanding ?? new Decimal('100.00'),
    invoiceDate: over.invoiceDate ?? new Date('2026-01-01'),
    status: over.status ?? 'SENT',
  };
}

function customer(over: Partial<ScoreCustomer> = {}): ScoreCustomer {
  return { displayName: over.displayName ?? 'Office Cleaners Maddington' };
}

describe('scoreInvoice — signal isolation', () => {
  it('invoice# match in description: +60', () => {
    const s = scoreInvoice(tx({ description: 'PMT INV1011 THANKS' }), invoice(), customer({ displayName: 'X' }));
    expect(s.total).toBe(60);
    expect(s.signals.invoiceNumber).toBe(true);
  });

  it('invoice# with leading zeros: +60', () => {
    const s = scoreInvoice(tx({ description: 'INV-001011' }), invoice(), customer({ displayName: 'X' }));
    expect(s.signals.invoiceNumber).toBe(true);
  });

  it('invoice# with space: +60', () => {
    const s = scoreInvoice(tx({ description: 'PMT INV 1011' }), invoice(), customer({ displayName: 'X' }));
    expect(s.signals.invoiceNumber).toBe(true);
  });

  it('invoice# present but WRONG number: 0', () => {
    const s = scoreInvoice(tx({ description: 'INV-9999' }), invoice({ invoiceNumber: 1011 }), customer({ displayName: 'X' }));
    expect(s.signals.invoiceNumber).toBe(false);
    expect(s.total).toBe(0);
  });

  it('exact amount equality (Decimal): +40 — no other signals', () => {
    const s = scoreInvoice(
      tx({ unallocated: new Decimal('1234.56'), description: 'XYZ', date: new Date('2026-12-31') }),
      invoice({ amountOutstanding: new Decimal('1234.56'), invoiceDate: new Date('2020-01-01') }),
      customer({ displayName: 'X' }),
    );
    expect(s.total).toBe(40);
    expect(s.signals.exactAmount).toBe(true);
  });

  it('exact amount mismatch (1 cent off): 0', () => {
    const s = scoreInvoice(
      tx({ unallocated: new Decimal('1234.55') }),
      invoice({ amountOutstanding: new Decimal('1234.56') }),
      customer({ displayName: 'X' }),
    );
    expect(s.signals.exactAmount).toBe(false);
  });

  it('customer-name token (>=4 chars) matches: +15', () => {
    const s = scoreInvoice(
      tx({ description: 'pmt from cleaners ltd' }),
      invoice(),
      customer({ displayName: 'Office Cleaners Maddington' }),
    );
    expect(s.signals.customerToken).toBe(true);
  });

  it('customer-name 3-char token does NOT count (e.g. "LTD")', () => {
    const s = scoreInvoice(
      tx({ description: 'PMT FROM LTD' }),
      invoice(),
      customer({ displayName: 'LTD PTY THE' }),
    );
    expect(s.signals.customerToken).toBe(false);
  });

  it('date exactly invoiceDate: +10', () => {
    const d = new Date('2026-01-01');
    const s = scoreInvoice(tx({ date: d }), invoice({ invoiceDate: d }), customer({ displayName: 'X' }));
    expect(s.signals.datePlausible).toBe(true);
  });

  it('date invoiceDate + 60d: +10 (inclusive upper)', () => {
    const s = scoreInvoice(
      tx({ date: new Date('2026-03-02') }),
      invoice({ invoiceDate: new Date('2026-01-01') }),
      customer({ displayName: 'X' }),
    );
    expect(s.signals.datePlausible).toBe(true);
  });

  it('date invoiceDate + 61d: 0', () => {
    const s = scoreInvoice(
      tx({ date: new Date('2026-03-03') }),
      invoice({ invoiceDate: new Date('2026-01-01') }),
      customer({ displayName: 'X' }),
    );
    expect(s.signals.datePlausible).toBe(false);
  });

  it('date one day BEFORE invoiceDate: 0', () => {
    const s = scoreInvoice(
      tx({ date: new Date('2025-12-31') }),
      invoice({ invoiceDate: new Date('2026-01-01') }),
      customer({ displayName: 'X' }),
    );
    expect(s.signals.datePlausible).toBe(false);
  });

  it('invoice status PARTIAL_PAID: +5', () => {
    const s = scoreInvoice(tx(), invoice({ status: 'PARTIAL_PAID' }), customer({ displayName: 'X' }));
    expect(s.signals.partialBonus).toBe(true);
  });

  it('invoice status SENT: no partial bonus', () => {
    const s = scoreInvoice(tx(), invoice({ status: 'SENT' }), customer({ displayName: 'X' }));
    expect(s.signals.partialBonus).toBe(false);
  });
});

describe('scoreInvoice — combinations', () => {
  it('all six signals fire: 60+40+15+10+5 = 130', () => {
    const d = new Date('2026-01-10');
    const s = scoreInvoice(
      tx({ description: 'INV-1011 OFFICE CLEANERS', unallocated: new Decimal('100.00'), date: d }),
      invoice({ invoiceNumber: 1011, amountOutstanding: new Decimal('100.00'), invoiceDate: new Date('2026-01-01'), status: 'PARTIAL_PAID' }),
      customer({ displayName: 'Office Cleaners Maddington' }),
    );
    expect(s.total).toBe(130);
  });

  it('case-insensitive customer token', () => {
    const s = scoreInvoice(
      tx({ description: 'PMT FROM OFFICE CLEANERS' }),
      invoice(),
      customer({ displayName: 'office cleaners' }),
    );
    expect(s.signals.customerToken).toBe(true);
  });
});
