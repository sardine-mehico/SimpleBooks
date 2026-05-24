import { Decimal } from '@prisma/client/runtime/library';
import { findBundleSuggestion, type BundleInvoice } from './bundle';

function inv(id: string, outstanding: string, invoiceDate: string): BundleInvoice {
  return { id, invoiceNumber: Number(id.replace(/\D/g, '')) || 1, amountOutstanding: new Decimal(outstanding), invoiceDate: new Date(invoiceDate) };
}

describe('findBundleSuggestion', () => {
  it('returns null when invoices array is empty', () => {
    expect(findBundleSuggestion(new Decimal('100'), [])).toBeNull();
  });

  it('returns null when no pair sums to target', () => {
    const r = findBundleSuggestion(new Decimal('500.00'), [inv('1', '100.00', '2026-01-01'), inv('2', '200.00', '2026-01-02')]);
    expect(r).toBeNull();
  });

  it('finds a 2-of-3 exact-sum bundle', () => {
    const r = findBundleSuggestion(new Decimal('300.00'), [
      inv('1', '100.00', '2026-01-01'),
      inv('2', '200.00', '2026-01-02'),
      inv('3', '50.00',  '2026-01-03'),
    ]);
    expect(r?.invoices.map((i) => i.id)).toEqual(['1', '2']);
    expect(r?.total.toString()).toBe('300');
  });

  it('finds a 3-of-3 exact-sum bundle when no pair works', () => {
    const r = findBundleSuggestion(new Decimal('350.00'), [
      inv('1', '100.00', '2026-01-01'),
      inv('2', '200.00', '2026-01-02'),
      inv('3', '50.00',  '2026-01-03'),
    ]);
    expect(r?.invoices.map((i) => i.id)).toEqual(['1', '2', '3']);
  });

  it('prefers the OLDEST combination on duplicate-amount sets', () => {
    const r = findBundleSuggestion(new Decimal('200.00'), [
      inv('1', '100.00', '2026-01-01'),
      inv('2', '100.00', '2026-01-02'),
      inv('3', '100.00', '2026-01-03'),
    ]);
    // Oldest pair is (1, 2).
    expect(r?.invoices.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('excludes zero-outstanding invoices from the combinatorial set', () => {
    const r = findBundleSuggestion(new Decimal('100.00'), [
      inv('1', '0.00',   '2026-01-01'),
      inv('2', '60.00',  '2026-01-02'),
      inv('3', '40.00',  '2026-01-03'),
    ]);
    expect(r?.invoices.map((i) => i.id)).toEqual(['2', '3']);
  });

  it('returns null when there are more than 8 candidates (early skip)', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      inv(String(i + 1), '100.00', `2026-01-${String(i + 1).padStart(2, '0')}`),
    );
    // 100 * 2 = 200 would otherwise be findable.
    const r = findBundleSuggestion(new Decimal('200.00'), many);
    expect(r).toBeNull();
  });
});
