import { EngineRule, EngineRuleCondition, EngineTransactionInput, normaliseDesc } from './types';

const APPROXIMATE_EPSILON = 0.005;

function conditionMatches(tx: EngineTransactionInput, c: EngineRuleCondition): boolean {
  const v = c.value;
  switch (c.field) {
    case 'DESCRIPTION': {
      const hay = normaliseDesc(tx.description);
      const needle = normaliseDesc(v);
      switch (c.operator) {
        case 'CONTAINS':    return hay.includes(needle);
        case 'EQUALS':      return hay === needle;
        case 'STARTS_WITH': return hay.startsWith(needle);
        case 'ENDS_WITH':   return hay.endsWith(needle);
        default: return false;
      }
    }
    case 'AMOUNT': {
      const amt = Number(tx.amount);
      const target = Number(v);
      switch (c.operator) {
        case 'EQUALS':  return Math.abs(amt - target) < APPROXIMATE_EPSILON;
        case 'GT':      return amt > target;
        case 'LT':      return amt < target;
        case 'BETWEEN': {
          const upper = Number(c.value2 ?? '');
          if (Number.isNaN(upper)) return false;
          return amt >= target && amt <= upper;
        }
        default: return false;
      }
    }
    case 'VENDOR': {
      if (tx.vendorId === null) return false;
      switch (c.operator) {
        case 'EQUALS': return tx.vendorId === v;
        case 'IN':     return c.valueList.includes(tx.vendorId);
        default: return false;
      }
    }
    case 'ACCOUNT': {
      switch (c.operator) {
        case 'EQUALS': return tx.accountId === v;
        case 'IN':     return c.valueList.includes(tx.accountId);
        default: return false;
      }
    }
  }
}

export function allConditionsMatch(tx: EngineTransactionInput, rule: EngineRule): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.conditions.every((c) => conditionMatches(tx, c));
}

function isEngineActive(r: EngineRule): boolean {
  return (r.state === 'USER' || r.state === 'APPROVED') && r.isActive;
}

export type RuleMatchResult = {
  winner: { ruleId: string; ruleName: string; priority: number; categoryId: string; categoryName: string } | null;
  allMatching: Array<{ ruleId: string; ruleName: string; priority: number }>;
};

export function matchRules(tx: EngineTransactionInput, rules: EngineRule[]): RuleMatchResult {
  const sorted = rules.filter(isEngineActive).sort((a, b) => a.priority - b.priority);
  const allMatching: RuleMatchResult['allMatching'] = [];
  let winner: RuleMatchResult['winner'] = null;
  for (const r of sorted) {
    if (allConditionsMatch(tx, r)) {
      if (winner === null) {
        winner = { ruleId: r.id, ruleName: r.name, priority: r.priority, categoryId: r.categoryId, categoryName: r.categoryName };
      }
      allMatching.push({ ruleId: r.id, ruleName: r.name, priority: r.priority });
    }
  }
  return { winner, allMatching };
}
