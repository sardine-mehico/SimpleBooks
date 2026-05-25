import { createHash } from 'node:crypto';
import { normaliseDesc } from './csv-parser.service';

// sha256 of date|amount|normaliseDesc(description)|ordinal.
// `amount` is pre-normalised to "X.XX" by the caller (parser already
// applies Number(s).toFixed(2) before this is reached).
// `ordinal` is the row's 1-based position within its (date|amount|desc)
// group in the input batch — single occurrences are always ordinal 1.
// Including it lets N identical rows in a single file produce N distinct
// hashes so all land instead of being silently merged by the unique
// index. See ordinals.ts for assignment logic.
export function rowImportHash(
  date: string,
  amount: string,
  description: string,
  ordinal: number,
): string {
  const payload = [date, amount, normaliseDesc(description), String(ordinal)].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function fileSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
