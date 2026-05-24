import { Decimal } from '@prisma/client/runtime/library';
import { recomputeInvoicePayment } from './recompute';

// Minimal invoice shape used by the helper. Mirrors what PaymentsService selects.
function inv(over: Partial<{
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'VOID';
  totalAmount: string;
  viewedAt: Date | null;
  sendAttempts: number;
}> = {}) {
  return {
    status: over.status ?? 'SENT',
    totalAmount: new Decimal(over.totalAmount ?? '100.00'),
    viewedAt: over.viewedAt ?? null,
    sendAttempts: over.sendAttempts ?? 1,
  };
}

function allocs(...amounts: string[]) {
  return amounts.map((a) => ({ amount: new Decimal(a) }));
}

describe('recomputeInvoicePayment', () => {
  it('returns DRAFT when status is DRAFT, no allocations, no sendAttempts, no viewedAt', () => {
    const r = recomputeInvoicePayment(inv({ status: 'DRAFT', sendAttempts: 0 }), []);
    expect(r.status).toBe('DRAFT');
    expect(r.amountPaid.toString()).toBe('0');
    expect(r.amountOutstanding.toString()).toBe('100');
  });

  it('returns SENT when sendAttempts > 0 and no allocations and no viewedAt', () => {
    const r = recomputeInvoicePayment(inv({ status: 'SENT' }), []);
    expect(r.status).toBe('SENT');
  });

  it('returns VIEWED when viewedAt is set and no allocations', () => {
    const r = recomputeInvoicePayment(inv({ status: 'VIEWED', viewedAt: new Date() }), []);
    expect(r.status).toBe('VIEWED');
  });

  it('returns PARTIAL_PAID when 0 < allocSum < totalAmount', () => {
    const r = recomputeInvoicePayment(inv({ status: 'SENT', totalAmount: '100.00' }), allocs('40.00'));
    expect(r.status).toBe('PARTIAL_PAID');
    expect(r.amountPaid.toString()).toBe('40');
    expect(r.amountOutstanding.toString()).toBe('60');
  });

  it('returns PAID when allocSum equals totalAmount', () => {
    const r = recomputeInvoicePayment(inv({ status: 'PARTIAL_PAID', totalAmount: '100.00' }), allocs('60.00', '40.00'));
    expect(r.status).toBe('PAID');
    expect(r.amountPaid.toString()).toBe('100');
    expect(r.amountOutstanding.toString()).toBe('0');
  });

  it('VOID is terminal — never recomputed away even when allocations sum to total', () => {
    const r = recomputeInvoicePayment(inv({ status: 'VOID', totalAmount: '100.00' }), allocs('100.00'));
    expect(r.status).toBe('VOID');
  });

  it('viewedAt is sticky — un-applied PAID with viewedAt reverts to VIEWED, not SENT', () => {
    const r = recomputeInvoicePayment(inv({ status: 'PAID', totalAmount: '100.00', viewedAt: new Date(), sendAttempts: 1 }), []);
    expect(r.status).toBe('VIEWED');
  });

  it('un-applied PAID without viewedAt reverts to SENT when sendAttempts > 0', () => {
    const r = recomputeInvoicePayment(inv({ status: 'PAID', totalAmount: '100.00', viewedAt: null, sendAttempts: 1 }), []);
    expect(r.status).toBe('SENT');
  });

  it('totalAmount = 0 with 0 allocations satisfies allocSum == totalAmount → PAID', () => {
    const r = recomputeInvoicePayment(inv({ status: 'DRAFT', totalAmount: '0.00', sendAttempts: 0 }), []);
    expect(r.status).toBe('PAID');
  });

  it('is idempotent — running on a stable invoice changes nothing', () => {
    const invoice = inv({ status: 'PARTIAL_PAID', totalAmount: '100.00' });
    const a = allocs('40.00');
    const r1 = recomputeInvoicePayment(invoice, a);
    const r2 = recomputeInvoicePayment({ ...invoice, status: r1.status }, a);
    expect(r1).toEqual(r2);
  });
});
