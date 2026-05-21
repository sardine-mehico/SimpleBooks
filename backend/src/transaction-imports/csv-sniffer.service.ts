import Papa from 'papaparse';
import { ColumnMapping, ColumnRole, DateFormat, MappingSuggestion } from './types';

function tryParseDate(value: string, fmt: DateFormat): boolean {
  const s = value.trim();
  if (fmt === 'DD/MM/YYYY' || fmt === 'MM/DD/YYYY') return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(s);
}

function tryParseSignedDecimal(value: string): boolean {
  const s = value.trim().replace(/^"|"$/g, '').replace(/^\+/, '').replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(s) && s !== '';
}

function isTextish(value: string): boolean {
  return /[a-zA-Z]/.test(value);
}

export function sniffCsv(buffer: Buffer): MappingSuggestion {
  const text = buffer.toString('utf-8');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const matrix = parsed.data as string[][];
  if (matrix.length === 0) {
    throw new Error('CSV contains no data rows');
  }

  const ncols = Math.max(...matrix.map((r) => r.length));
  const reasoning: string[] = [];

  // Determine which date format works best across all rows of column 0.
  function scoreDateFmt(colIdx: number, fmt: DateFormat, rows: string[][]): number {
    if (rows.length === 0) return 0;
    const hits = rows.filter((r) => tryParseDate(r[colIdx] ?? '', fmt)).length;
    return hits / rows.length;
  }

  // Header detection: tentatively try with full data, then with first row stripped.
  // The "data" half should score >> the "header" half for at least one column.
  function bestDateFormatFor(rows: string[][], colIdx: number): { fmt: DateFormat; score: number } {
    const formats: DateFormat[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
    let best = { fmt: 'DD/MM/YYYY' as DateFormat, score: 0 };
    for (const fmt of formats) {
      const s = scoreDateFmt(colIdx, fmt, rows);
      if (s > best.score) best = { fmt, score: s };
    }
    return best;
  }

  // Step 1: detect header by checking if row 0's parseability against any format
  // is dramatically lower than the rest.
  let hasHeader = false;
  if (matrix.length >= 2) {
    const firstRow = [matrix[0]];
    const restRows = matrix.slice(1);
    let firstRowDateHit = false;
    let restRowDateHit = false;
    for (let c = 0; c < ncols; c++) {
      const f = bestDateFormatFor(firstRow, c).score;
      const r = bestDateFormatFor(restRows, c).score;
      if (f >= 0.5) firstRowDateHit = true;
      if (r >= 0.8) restRowDateHit = true;
    }
    if (restRowDateHit && !firstRowDateHit) {
      hasHeader = true;
      reasoning.push('Row 0 has no parseable dates; subsequent rows do — treating as header.');
    }
  }

  const dataRows = hasHeader ? matrix.slice(1) : matrix;

  // Step 2: per-column scoring.
  type Scores = { date: { fmt: DateFormat; score: number }; amount: number; balance: number; text: number };
  const colScores: Scores[] = [];
  for (let c = 0; c < ncols; c++) {
    const dateScore = bestDateFormatFor(dataRows, c);
    const amountHits = dataRows.filter((r) => tryParseSignedDecimal(r[c] ?? '')).length;
    const amountScore = dataRows.length ? amountHits / dataRows.length : 0;
    const textHits = dataRows.filter((r) => isTextish(r[c] ?? '')).length;
    const textScore = dataRows.length ? textHits / dataRows.length : 0;

    // Balance signature: looks like a decimal AND values change row-to-row AND
    // values are predominantly the same sign (running balance rarely flips sign).
    let balanceScore = 0;
    if (amountScore > 0.8) {
      const nums = dataRows.map((r) => Number((r[c] ?? '').replace(/^"|"$/g, '').replace(/^\+/, '').replace(/,/g, '')));
      const changes = nums.slice(1).filter((v, i) => Math.abs(v - nums[i]) > 0.005).length;
      const changeRatio = dataRows.length > 1 ? changes / (dataRows.length - 1) : 0;
      // Penalise columns where values mix positive and negative — those are
      // transaction amounts, not a running balance.
      const negCount = nums.filter((v) => v < 0).length;
      const posCount = nums.filter((v) => v > 0).length;
      const dominantSign = Math.max(negCount, posCount);
      const signPurity = nums.length > 0 ? dominantSign / nums.length : 0;
      balanceScore = changeRatio * signPurity;
    }

    colScores.push({ date: dateScore, amount: amountScore, balance: balanceScore, text: textScore });
  }

  // Step 3: assign roles. Pick best date column first, then balance (highest
  // balance score over 0.7 among amount-like columns OTHER than the date col),
  // then amount/debit/credit, then description.
  const roles: ColumnRole[] = new Array(ncols).fill('ignore');

  // Date
  let dateIdx = -1;
  let dateFmt: DateFormat = 'DD/MM/YYYY';
  let bestDate = 0;
  for (let c = 0; c < ncols; c++) {
    if (colScores[c].date.score > bestDate) {
      bestDate = colScores[c].date.score;
      dateIdx = c;
      dateFmt = colScores[c].date.fmt;
    }
  }
  if (dateIdx >= 0) {
    roles[dateIdx] = 'date';
    reasoning.push(`Col ${dateIdx}: date in ${dateFmt} (score ${bestDate.toFixed(2)})`);
  }

  // Amount candidates = columns with amountScore > 0.8 that aren't the date column.
  const amountCandidates = colScores
    .map((s, c) => ({ c, s }))
    .filter(({ c, s }) => c !== dateIdx && s.amount > 0.8)
    .sort((a, b) => b.s.amount - a.s.amount);

  if (amountCandidates.length >= 2) {
    // Pick the most-likely balance column = highest balanceScore among the candidates.
    const balancePick = [...amountCandidates].sort((a, b) => b.s.balance - a.s.balance)[0];
    // Pick amount = the candidate with the LOWEST balance score (transactions
    // jump up and down; running balance trends).
    const remaining = amountCandidates.filter((x) => x.c !== balancePick.c);
    const amountPick = remaining[0];
    if (balancePick.s.balance > 0.7) {
      roles[balancePick.c] = 'balance';
      reasoning.push(`Col ${balancePick.c}: running balance (changes every row)`);
    }
    if (amountPick) {
      roles[amountPick.c] = 'amount';
      reasoning.push(`Col ${amountPick.c}: signed amount`);
    }
  } else if (amountCandidates.length === 1) {
    roles[amountCandidates[0].c] = 'amount';
    reasoning.push(`Col ${amountCandidates[0].c}: signed amount`);
  } else {
    // No single signed-amount column. Look for two adjacent columns that
    // together look like a debit/credit split — at least one row has only
    // one of the two populated.
    for (let a = 0; a < ncols; a++) {
      for (let b = a + 1; b < ncols; b++) {
        if (a === dateIdx || b === dateIdx) continue;
        const eitherPopulated = dataRows.filter((r) => {
          const ra = (r[a] ?? '').trim();
          const rb = (r[b] ?? '').trim();
          return (ra !== '' && rb === '') || (ra === '' && rb !== '');
        }).length;
        if (dataRows.length > 0 && eitherPopulated / dataRows.length > 0.5) {
          // Assume the first of the two columns is debit, second is credit.
          // Real-world AU bank exports almost always order them that way.
          roles[a] = 'debit';
          roles[b] = 'credit';
          reasoning.push(`Cols ${a}/${b}: debit/credit split`);
          break;
        }
      }
      if (roles.includes('debit')) break;
    }
  }

  // Description = highest textScore among remaining columns.
  let descIdx = -1;
  let bestText = 0;
  for (let c = 0; c < ncols; c++) {
    if (roles[c] !== 'ignore') continue;
    if (colScores[c].text > bestText) {
      bestText = colScores[c].text;
      descIdx = c;
    }
  }
  if (descIdx >= 0) {
    roles[descIdx] = 'description';
    reasoning.push(`Col ${descIdx}: description (textScore ${bestText.toFixed(2)})`);
  }

  // Confidence: high if every assigned role except ignore scored above 0.9.
  const allAssigned = roles
    .map((role, c) => ({ role, c }))
    .filter((x) => x.role !== 'ignore');
  function scoreFor(role: ColumnRole, c: number): number {
    if (role === 'date') return colScores[c].date.score;
    if (role === 'amount' || role === 'debit' || role === 'credit') return colScores[c].amount;
    if (role === 'balance') return colScores[c].balance;
    if (role === 'description') return colScores[c].text;
    return 0;
  }
  const minScore = allAssigned.length
    ? Math.min(...allAssigned.map((x) => scoreFor(x.role, x.c)))
    : 0;
  const confidence: 'high' | 'medium' | 'low' =
    minScore >= 0.9 ? 'high' : minScore >= 0.6 ? 'medium' : 'low';

  const mapping: ColumnMapping = { hasHeader, dateFormat: dateFmt, columns: roles };
  return { mapping, confidence, reasoning };
}
