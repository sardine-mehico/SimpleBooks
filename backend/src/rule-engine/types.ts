// Shared types for the engine. These mirror Prisma row shapes (with the
// fields the matcher actually needs) and the EngineOutput shape consumed by
// both the bulk re-categorise endpoint and the Test Rules sandbox.

export type EngineTransactionInput = {
  id: string;
  date: string;
  amount: string;
  description: string;
  accountId: string;
  hasSplits: boolean;
};

export type EngineRuleCondition = {
  field: 'DESCRIPTION' | 'AMOUNT' | 'ACCOUNT';
  operator: 'CONTAINS' | 'EQUALS' | 'STARTS_WITH' | 'ENDS_WITH' | 'GT' | 'LT' | 'BETWEEN' | 'IN';
  value: string;
  value2: string | null;
  valueList: string[];
};

export type EngineRule = {
  id: string;
  name: string;
  state: 'USER' | 'AI_DRAFTED' | 'APPROVED' | 'DENIED';
  isActive: boolean;
  priority: number;
  categoryId: string;
  categoryName: string;
  noteOnApply: string | null;
  conditions: EngineRuleCondition[];
};

export type EngineRowResult = {
  transactionId: string;
  date: string;
  amount: string;
  description: string;
  ruleMatch: { ruleId: string; ruleName: string; priority: number; categoryId: string; categoryName: string } | null;
  allMatchingRules: Array<{ ruleId: string; ruleName: string; priority: number }>;
  skipped: 'has-splits' | 'no-rule-match' | null;
};

export type EngineOutput = {
  rows: EngineRowResult[];
  stats: {
    total: number;
    ruleMatched: number;
    preservedSplits: number;
    unchanged: number;
    perRule: Array<{ ruleId: string; ruleName: string; count: number }>;
  };
};

export function normaliseDesc(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
