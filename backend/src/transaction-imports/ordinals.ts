import { normaliseDesc } from './csv-parser.service';
import type { ParsedRow } from './types';

/**
 * Assigns a 1-based ordinal to each row indicating its position within
 * its (date|amount|normalisedDesc) group. Used by the import hash to
 * distinguish otherwise-identical rows in the same file (e.g. a bank
 * crediting the same amount from the same payer 11 times in one day).
 *
 * Returns rows in the same order as the input (only the `ordinal` field
 * is added). The ordinal-assignment order within a group is the rows'
 * original input order — deterministic for a given input.
 */
export function assignOrdinals<R extends ParsedRow>(
  rows: R[],
): Array<R & { ordinal: number }> {
  const groupCounts = new Map<string, number>();
  return rows.map((r) => {
    const amount = Number(r.amount).toFixed(2);
    const key = `${r.date}|${amount}|${normaliseDesc(r.description)}`;
    const next = (groupCounts.get(key) ?? 0) + 1;
    groupCounts.set(key, next);
    return { ...r, ordinal: next };
  });
}
