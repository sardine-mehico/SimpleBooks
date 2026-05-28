import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { matchRules } from './rule-matcher';
import {
  EngineOutput,
  EngineRowResult,
  EngineRule,
  EngineRuleCondition,
  EngineTransactionInput,
} from './types';

export interface EngineInput {
  transactionIds?: string[];
  filter?: {
    accountIds?: string[];
    dateFrom?: string;
    dateTo?: string;
    scope: 'uncategorised' | 'all';
  };
  csvRows?: Array<{ date: string; amount: string; description: string }>;
  ruleIds?: string[];
  preserveSplits: boolean;
  applyRules: boolean;
  dryRun: boolean;
}

@Injectable()
export class RuleEngineService {
  constructor(private prisma: PrismaService) {}

  async run(input: EngineInput): Promise<EngineOutput> {
    const ruleRows = await this.prisma.rule.findMany({
      where: input.ruleIds?.length ? { id: { in: input.ruleIds } } : {},
      include: {
        conditions: { orderBy: { position: 'asc' } },
        category: { select: { id: true, name: true } },
      },
      orderBy: { priority: 'asc' },
    });
    const engineRules: EngineRule[] = ruleRows.map((r) => ({
      id: r.id, name: r.name,
      state: r.state as EngineRule['state'],
      isActive: r.isActive, priority: r.priority,
      categoryId: r.categoryId, categoryName: r.category.name,
      noteOnApply: r.noteOnApply,
      conditions: r.conditions.map<EngineRuleCondition>((c) => ({
        field: c.field as EngineRuleCondition['field'],
        operator: c.operator as EngineRuleCondition['operator'],
        value: c.value, value2: c.value2, valueList: c.valueList,
      })),
    }));

    let txInputs: EngineTransactionInput[];
    let txRecordById: Map<string, { id: string; categoryId: string | null; notes: string | null }>;
    if (input.csvRows) {
      txInputs = input.csvRows.map((r, i) => ({
        id: `csv:${i}`,
        date: r.date, amount: r.amount, description: r.description,
        accountId: '', hasSplits: false,
      }));
      txRecordById = new Map();
    } else {
      const where: any = {};
      if (input.transactionIds?.length) where.id = { in: input.transactionIds };
      if (input.filter) {
        if (input.filter.accountIds?.length) where.accountId = { in: input.filter.accountIds };
        if (input.filter.dateFrom || input.filter.dateTo) {
          where.date = {};
          if (input.filter.dateFrom) where.date.gte = new Date(input.filter.dateFrom);
          if (input.filter.dateTo) where.date.lte = new Date(input.filter.dateTo);
        }
        if (input.filter.scope === 'uncategorised') where.categoryId = null;
      }
      const rows = await this.prisma.transaction.findMany({
        where,
        select: {
          id: true, date: true, amount: true, description: true, accountId: true,
          categoryId: true, notes: true,
          _count: { select: { splits: true } },
        },
      });
      txInputs = rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        amount: r.amount.toString(),
        description: r.description,
        accountId: r.accountId,
        hasSplits: r._count.splits > 0,
      }));
      txRecordById = new Map(rows.map((r) => [r.id, { id: r.id, categoryId: r.categoryId, notes: r.notes }]));
    }

    const results: EngineRowResult[] = [];
    let preservedSplitsCount = 0;
    let ruleMatchedCount = 0;
    const perRuleCount = new Map<string, { ruleName: string; count: number }>();

    for (const tx of txInputs) {
      const result: EngineRowResult = {
        transactionId: tx.id,
        date: tx.date, amount: tx.amount, description: tx.description,
        ruleMatch: null, allMatchingRules: [], skipped: null,
      };

      if (tx.hasSplits && input.preserveSplits) {
        result.skipped = 'has-splits';
        preservedSplitsCount++;
        results.push(result);
        continue;
      }

      if (input.applyRules) {
        const rm = matchRules(tx, engineRules);
        result.ruleMatch = rm.winner;
        result.allMatchingRules = rm.allMatching;
        if (!rm.winner) result.skipped = 'no-rule-match';
      }

      if (result.ruleMatch) {
        ruleMatchedCount++;
        const prev = perRuleCount.get(result.ruleMatch.ruleId);
        if (prev) prev.count++;
        else perRuleCount.set(result.ruleMatch.ruleId, { ruleName: result.ruleMatch.ruleName, count: 1 });
      }
      results.push(result);
    }

    if (!input.dryRun && !input.csvRows) {
      await this.applyResults(results, txRecordById, engineRules);
    }

    return {
      rows: results,
      stats: {
        total: results.length,
        ruleMatched: ruleMatchedCount,
        preservedSplits: preservedSplitsCount,
        unchanged: results.filter((r) => !r.ruleMatch && !r.skipped).length,
        perRule: Array.from(perRuleCount.entries()).map(([ruleId, v]) => ({
          ruleId, ruleName: v.ruleName, count: v.count,
        })),
      },
    };
  }

  private async applyResults(
    results: EngineRowResult[],
    txRecordById: Map<string, { id: string; categoryId: string | null; notes: string | null }>,
    engineRules: EngineRule[],
  ) {
    const ruleById = new Map(engineRules.map((r) => [r.id, r]));
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const perRuleDelta = new Map<string, number>();

      for (const r of results) {
        const orig = txRecordById.get(r.transactionId);
        if (!orig) continue;

        if (r.ruleMatch) {
          const winningRule = ruleById.get(r.ruleMatch.ruleId);
          const newCategoryId = r.ruleMatch.categoryId;
          if (orig.categoryId !== newCategoryId) {
            let updatedNotes = orig.notes;
            if (winningRule?.noteOnApply) {
              updatedNotes = orig.notes
                ? `${orig.notes}\n${winningRule.noteOnApply}`
                : winningRule.noteOnApply;
            }
            await tx.transaction.update({
              where: { id: orig.id },
              data: {
                categoryId: newCategoryId,
                ruleId: r.ruleMatch.ruleId,
                categorisedAt: now,
                notes: updatedNotes,
              },
            });
            await tx.categorisationEvent.create({
              data: {
                transactionId: orig.id,
                source: 'RULE',
                ruleId: r.ruleMatch.ruleId,
                oldCategoryId: orig.categoryId,
                newCategoryId,
              },
            });
            perRuleDelta.set(r.ruleMatch.ruleId, (perRuleDelta.get(r.ruleMatch.ruleId) ?? 0) + 1);
          }
        }
      }

      for (const [ruleId, delta] of perRuleDelta) {
        await tx.rule.update({
          where: { id: ruleId },
          data: { hitCount: { increment: delta }, lastFiredAt: now },
        });
      }
    });
  }
}
