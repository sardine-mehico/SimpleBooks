import { createHash } from 'node:crypto';
import { normaliseDesc } from './csv-parser.service';

// Per the spec: sha256 of date|amount.toFixed(2)|normaliseDesc(description)|runningBalance ?? ''
export function rowImportHash(
  date: string,
  amount: string,
  description: string,
  runningBalance: string | null,
): string {
  const payload = [date, amount, normaliseDesc(description), runningBalance ?? ''].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function fileSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
