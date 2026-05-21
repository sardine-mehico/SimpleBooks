import Papa from 'papaparse';
import {
  ColumnMapping,
  ColumnRole,
  DateFormat,
  ParseError,
  ParsedRow,
  ParseResult,
} from './types';

// Lowercases, collapses whitespace, trims. Used ONLY for hashing — the
// stored description is the original verbatim string from the file.
export function normaliseDesc(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Validates the mapping shape and throws synchronously with a 422-friendly
// error. The orchestrator catches and re-throws as a Nest HttpException.
function validateMapping(mapping: ColumnMapping): void {
  const counts: Record<ColumnRole, number> = {
    date: 0, description: 0, amount: 0, debit: 0, credit: 0, balance: 0, ignore: 0,
  };
  for (const r of mapping.columns) counts[r]++;

  if (counts.date < 1) throw new Error('Mapping must include exactly one date column');
  if (counts.date > 1) throw new Error('Mapping has more than one date column');
  if (counts.description < 1) throw new Error('Mapping must include at least one description column');
  if (counts.balance > 1) throw new Error('Mapping has more than one balance column');

  const styleA = counts.amount === 1 && counts.debit === 0 && counts.credit === 0;
  const styleB = counts.amount === 0 && counts.debit === 1 && counts.credit === 1;
  if (!styleA && !styleB) {
    throw new Error(
      'Mapping must be Style A (one amount column) or Style B (one debit + one credit column)',
    );
  }
}

function parseDateOrThrow(raw: string, fmt: DateFormat): string {
  const s = raw.trim();
  let m: RegExpMatchArray | null;
  let year: number, month: number, day: number;
  if (fmt === 'DD/MM/YYYY') {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) throw new Error(`Date "${raw}" does not match DD/MM/YYYY`);
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if (fmt === 'MM/DD/YYYY') {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) throw new Error(`Date "${raw}" does not match MM/DD/YYYY`);
    [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) throw new Error(`Date "${raw}" does not match YYYY-MM-DD`);
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Date "${raw}" has invalid month/day`);
  }
  // Validate that the date is a real calendar date (e.g., reject Apr 31, Feb 29 in non-leap years).
  // Use local calendar constructor — no UTC drift.
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    throw new Error(`Date "${raw}" is not a real calendar date`);
  }
  // Build YYYY-MM-DD directly from parts — no `new Date()` round-trip
  // (CLAUDE.md gotcha: +08:00 timezone would shift the calendar day back).
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function parseSignedDecimal(raw: string): string {
  // Strip surrounding whitespace and quotes; allow leading +.
  let s = raw.trim().replace(/^"|"$/g, '').trim();
  if (s === '') return '';
  if (s.startsWith('+')) s = s.slice(1);
  // Strip thousands commas. Keep negative sign and decimal point.
  s = s.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Amount "${raw}" is not a decimal`);
  // Normalise to two-decimal-place string for stable hashing.
  return Number(s).toFixed(2);
}

export function parseCsv(buffer: Buffer, mapping: ColumnMapping): ParseResult {
  validateMapping(mapping);

  const text = buffer.toString('utf-8');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });

  let allRows = parsed.data as string[][];
  if (mapping.hasHeader && allRows.length > 0) allRows = allRows.slice(1);

  const rows: ParsedRow[] = [];
  const parseErrors: ParseError[] = [];

  const colsByRole = new Map<ColumnRole, number>();
  mapping.columns.forEach((role, i) => {
    // Only keep the first index for each role (validateMapping already
    // ensures at most one for the constrained roles).
    if (!colsByRole.has(role)) colsByRole.set(role, i);
  });

  const dateIdx = colsByRole.get('date')!;
  const descIdx = colsByRole.get('description')!;
  const amountIdx = colsByRole.get('amount');
  const debitIdx = colsByRole.get('debit');
  const creditIdx = colsByRole.get('credit');
  const balanceIdx = colsByRole.get('balance');

  allRows.forEach((raw, i) => {
    try {
      const date = parseDateOrThrow(raw[dateIdx] ?? '', mapping.dateFormat);
      let amount: string;
      if (amountIdx !== undefined) {
        amount = parseSignedDecimal(raw[amountIdx] ?? '');
      } else {
        const d = (raw[debitIdx!] ?? '').trim();
        const c = (raw[creditIdx!] ?? '').trim();
        const dn = d === '' ? 0 : Number(parseSignedDecimal(d));
        const cn = c === '' ? 0 : Number(parseSignedDecimal(c));
        amount = (cn - dn).toFixed(2);
      }
      const description = (raw[descIdx] ?? '').trim();
      let runningBalance: string | null = null;
      if (balanceIdx !== undefined) {
        const v = (raw[balanceIdx] ?? '').trim();
        runningBalance = v === '' ? null : parseSignedDecimal(v);
      }
      rows.push({ date, amount, description, runningBalance });
    } catch (e) {
      parseErrors.push({
        rowIndex: i,
        reason: (e as Error).message,
        raw,
      });
    }
  });

  return { rows, parseErrors };
}
