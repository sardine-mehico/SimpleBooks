import { createHash } from 'node:crypto';
import { normaliseDesc } from './csv-parser.service';

// sha256 of date|amount.toFixed(2)|normaliseDesc(description).
// runningBalance is intentionally excluded — balance is derived
// (openingBalance + Σ amount) and not stored on Transaction.
export function rowImportHash(
  date: string,
  amount: string,
  description: string,
): string {
  const payload = [date, amount, normaliseDesc(description)].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function fileSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
