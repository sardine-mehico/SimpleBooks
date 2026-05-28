// Shared types for sniffer, parser, controller, and the frontend.
// Persisted verbatim in TransactionImport.mappingJson and reportJson.

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export type ColumnRole =
  | 'date'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'balance'
  | 'ignore';

export interface ColumnMapping {
  hasHeader: boolean;
  dateFormat: DateFormat;
  columns: ColumnRole[]; // one per CSV column, by index
}

export interface ParsedRow {
  date: string; // YYYY-MM-DD, local calendar
  amount: string; // signed decimal as string, e.g. "-1750.00"
  description: string;
  runningBalance: string | null;
}

export interface ParseError {
  rowIndex: number; // 0-based, after header skip
  reason: string;
  raw: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  parseErrors: ParseError[];
}

export interface MappingSuggestion {
  mapping: ColumnMapping;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
}

export interface ImportRuleCategorisation {
  enabled: boolean;
  ruleMatched: number;
  perRule: Array<{ ruleId: string; ruleName: string; categoryName: string; count: number }>;
}

export interface ImportReport {
  importId: string;
  accountId: string;
  accountName: string;
  filename: string;
  fileSize: number;
  fileSha256: string;
  importedAt: string;
  mapping: ColumnMapping;
  counts: {
    total: number;
    imported: number;
    duplicates: number;
    failed: number;
  };
  imported: Array<{ date: string; amount: string; description: string }>;
  duplicates: Array<{
    date: string;
    amount: string;
    description: string;
    existingTransactionId: string;
  }>;
  failed: Array<{ rowIndex: number; reason: string; raw: string[] }>;
  warnings: string[];
  ruleCategorisation?: ImportRuleCategorisation | null;
}
