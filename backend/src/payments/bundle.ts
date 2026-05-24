import { Decimal } from '@prisma/client/runtime/library';

export interface BundleInvoice {
  id: string;
  invoiceNumber: number;
  amountOutstanding: Decimal;
  invoiceDate: Date;
}

export interface BundleSuggestion {
  invoices: BundleInvoice[];
  total: Decimal;
}

const MAX_CANDIDATES = 8;

export function findBundleSuggestion(
  target: Decimal,
  invoices: BundleInvoice[],
): BundleSuggestion | null {
  // Exclude zero-outstanding rows (they can't contribute to a sum).
  const pool = invoices
    .filter((i) => i.amountOutstanding.gt(0))
    .sort((a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime());

  if (pool.length === 0) return null;
  if (pool.length > MAX_CANDIDATES) return null;

  // 2-of-n combinations, oldest-first via the outer/inner index order.
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const sum = pool[i].amountOutstanding.add(pool[j].amountOutstanding);
      if (sum.eq(target)) {
        return { invoices: [pool[i], pool[j]], total: sum };
      }
    }
  }

  // 3-of-n combinations, oldest-first.
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const sum = pool[i].amountOutstanding
          .add(pool[j].amountOutstanding)
          .add(pool[k].amountOutstanding);
        if (sum.eq(target)) {
          return { invoices: [pool[i], pool[j], pool[k]], total: sum };
        }
      }
    }
  }

  return null;
}
