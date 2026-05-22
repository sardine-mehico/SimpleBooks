import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiClientService } from './ai-client.service';
import type { DraftRuleLlmResponse } from './types';

const BULK_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_BULK_MS ?? 60_000);
const MINING_WINDOW_DAYS = 180;
const AGREEMENT_RATIO = 0.8;
const SAMPLES_TO_LLM = 10;

// === Exported helpers (testable in isolation) ===

export function clusterKey(description: string): string | null {
  if (!description) return null;
  const upper = description.toUpperCase().replace(/\s+/g, ' ').trim();
  const allTokens = upper.split(' ');

  // Keep only tokens that appear before the first token containing a digit.
  // This strips merchant-location suffixes like "1234 SUBIACO" or "0078 KARRINYUP WA"
  // that appear after the numeric part of the description.
  const preDigit: string[] = [];
  for (const t of allTokens) {
    if (/\d/.test(t)) break;
    preDigit.push(t);
  }

  // From the pre-digit tokens, keep purely alphabetic ones of length >= 2.
  const alpha = preDigit.filter((t) => /^[A-Z]{2,}$/.test(t));

  if (alpha.length === 0) return null;
  const key = alpha.slice(0, 2).join(' ');
  if (key.length < 3) return null;
  return key;
}

export function computeClusterHash(key: string, categoryId: string): string {
  return createHash('sha256').update(`${key}|${categoryId}`).digest('hex').slice(0, 16);
}

export interface RawEvent {
  newCategoryId: string;
  transaction: { description: string; amount: string; date: Date };
}

export interface Cluster {
  clusterKey: string;
  newCategoryId: string;
  size: number;
  clusterHash: string;
  sampleDescriptions: string[];
}

export function buildClusters(
  events: RawEvent[],
  opts: { threshold: number },
): Cluster[] {
  const byKey = new Map<string, Map<string, RawEvent[]>>(); // key -> categoryId -> events
  for (const e of events) {
    if (!e.newCategoryId) continue;
    const k = clusterKey(e.transaction.description);
    if (!k) continue;
    const inner = byKey.get(k) ?? new Map<string, RawEvent[]>();
    const arr = inner.get(e.newCategoryId) ?? [];
    arr.push(e);
    inner.set(e.newCategoryId, arr);
    byKey.set(k, inner);
  }
  const out: Cluster[] = [];
  for (const [key, byCat] of byKey) {
    const total = Array.from(byCat.values()).reduce((s, a) => s + a.length, 0);
    for (const [categoryId, arr] of byCat) {
      if (arr.length < opts.threshold) continue;
      if (arr.length / total < AGREEMENT_RATIO) continue;
      out.push({
        clusterKey: key,
        newCategoryId: categoryId,
        size: arr.length,
        clusterHash: computeClusterHash(key, categoryId),
        sampleDescriptions: arr.slice(0, SAMPLES_TO_LLM).map((e) => e.transaction.description),
      });
    }
  }
  return out;
}

// === Service ===

@Injectable()
export class AiRuleDrafterService {
  constructor(private prisma: PrismaService, private ai: AiClientService) {}

  async mine(): Promise<{ drafted: number; skippedSuppressed: number; clustersConsidered: number; failed: number }> {
    const prefs = await this.prisma.preferences.findFirst();
    const threshold = prefs?.aiMiningThreshold ?? 5;
    const cutoff = new Date(Date.now() - MINING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const events = await this.prisma.categorisationEvent.findMany({
      where: {
        OR: [{ source: 'USER' }, { source: 'AI_APPLIED', acceptedAiSuggestion: true }],
        newCategoryId: { not: null },
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { transaction: { select: { description: true, amount: true, date: true } } },
    });

    const raw: RawEvent[] = events.map((e) => ({
      newCategoryId: e.newCategoryId!,
      transaction: {
        description: e.transaction.description,
        amount: e.transaction.amount.toString(),
        date: e.transaction.date,
      },
    }));
    const clusters = buildClusters(raw, { threshold });
    if (clusters.length === 0) return { drafted: 0, skippedSuppressed: 0, clustersConsidered: 0, failed: 0 };

    const hashes = clusters.map((c) => c.clusterHash);
    const existing = await this.prisma.rule.findMany({
      where: { clusterHash: { in: hashes } },
      select: { clusterHash: true },
    });
    const suppressed = new Set(existing.map((r) => r.clusterHash));
    const survivors = clusters.filter((c) => !suppressed.has(c.clusterHash));

    const SYSTEM = `You are a bookkeeping assistant. The user wants you to write a categorisation rule that captures a pattern in their history.

A rule has:
  - name (<= 60 chars)
  - one outcome category
  - 1-3 conditions, AND-only, each: { field, operator, value } from these enums:
      field: DESCRIPTION | AMOUNT | VENDOR | ACCOUNT
      operator: CONTAINS | EQUALS | STARTS_WITH | ENDS_WITH | GT | LT | BETWEEN | IN

Prefer the simplest rule that matches. Use DESCRIPTION CONTAINS most often.
Reach for STARTS_WITH only when descriptions share a clear prefix.
Use AMOUNT GT/LT/BETWEEN only when the pattern is amount-bounded.
Never use VENDOR field unless the matched vendor name is identical across all examples.

Output strict JSON matching the schema.`;

    const SCHEMA = {
      name: 'draft_rule_response',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'conditions', 'reasoning'],
        properties: {
          name: { type: 'string', maxLength: 60 },
          conditions: {
            type: 'array',
            minItems: 1, maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['field', 'operator', 'value'],
              properties: {
                field: { enum: ['DESCRIPTION', 'AMOUNT', 'VENDOR', 'ACCOUNT'] },
                operator: { enum: ['CONTAINS', 'EQUALS', 'STARTS_WITH', 'ENDS_WITH', 'GT', 'LT', 'BETWEEN', 'IN'] },
                value: { type: 'string' },
                value2: { type: ['string', 'null'] },
              },
            },
          },
          reasoning: { type: 'string', maxLength: 200 },
        },
      },
    };

    const categories = await this.prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const catName = new Map(categories.map((c) => [c.id, c.name]));

    let drafted = 0;
    let failed = 0;
    for (const c of survivors) {
      const userPrompt = [
        `CLUSTER:`,
        `  Category: ${catName.get(c.newCategoryId) ?? 'Unknown'}`,
        `  Events: ${c.size}`,
        '',
        'SAMPLE DESCRIPTIONS:',
        ...c.sampleDescriptions.map((d) => `  ${d}`),
        '',
        'Propose a rule.',
      ].join('\n');

      const result = await this.ai.complete<DraftRuleLlmResponse>({
        systemPrompt: SYSTEM,
        userPrompt,
        jsonSchema: SCHEMA,
        purpose: 'DRAFT_RULE',
        timeoutMs: BULK_TIMEOUT_MS,
      });

      if (!result.ok) { failed++; continue; }

      const validated = this.validateRule(result.data, c, catName.get(c.newCategoryId) ?? 'Unknown');
      if (!validated) { failed++; continue; }

      await this.prisma.rule.create({
        data: {
          name: validated.name,
          state: 'AI_DRAFTED',
          isActive: false,
          priority: 1000,
          categoryId: c.newCategoryId,
          clusterHash: c.clusterHash,
          noteOnApply: null,
          conditions: { create: validated.conditions.map((cond, i) => ({ ...cond, position: i })) },
        },
      });
      drafted++;
    }

    return {
      drafted,
      skippedSuppressed: clusters.length - survivors.length,
      clustersConsidered: clusters.length,
      failed,
    };
  }

  private validateRule(r: DraftRuleLlmResponse, cluster: Cluster, fallbackCategoryName: string) {
    const name = (r.name || '').trim() || `${fallbackCategoryName} from ${cluster.clusterKey}`;
    if (name.length > 60) return null;
    if (!Array.isArray(r.conditions) || r.conditions.length === 0 || r.conditions.length > 3) return null;
    const out: Array<{ field: any; operator: any; value: string; value2: string | null; valueList: string[] }> = [];
    for (const c of r.conditions) {
      if (!['DESCRIPTION', 'AMOUNT', 'VENDOR', 'ACCOUNT'].includes(c.field)) return null;
      if (!['CONTAINS', 'EQUALS', 'STARTS_WITH', 'ENDS_WITH', 'GT', 'LT', 'BETWEEN', 'IN'].includes(c.operator)) return null;
      if (c.operator === 'BETWEEN' && !c.value2) return null;
      const valueList = c.operator === 'IN' ? c.value.split(',').map((s) => s.trim()).filter(Boolean) : [];
      out.push({ field: c.field, operator: c.operator, value: c.value, value2: c.value2 ?? null, valueList });
    }
    return { name, conditions: out };
  }
}
