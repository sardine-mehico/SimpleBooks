import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiClientService } from './ai-client.service';
import { BulkRuns } from './bulk-runs';
import { pLimit } from './utils/p-limit';
import {
  CATEGORISE_SCHEMA,
  CATEGORISE_SYSTEM_PROMPT,
  buildCategoriseUserPrompt,
} from './prompts/categorise';
import type { AiConfidence, CategoriseLlmResponse } from './types';

const INLINE_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_INLINE_MS ?? 20_000);
const BULK_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_BULK_MS ?? 60_000);
const BULK_CONCURRENCY = Number(process.env.AI_BULK_CONCURRENCY ?? 5);

export interface AiDraftView {
  eventId: string;
  categoryId: string | null;
  categoryName: string | null;
  confidence: AiConfidence;
  reasoning: string;
  providerId: string | null;
  providerName: string | null;
  createdAt: string;
}

export type SuggestResult =
  | { kind: 'fresh'; draft: AiDraftView }
  | { kind: 'cached'; draft: AiDraftView }
  | { kind: 'failed'; error: string };

export type ApplyDecision =
  | { action: 'accept' }
  | { action: 'edit'; chosenCategoryId: string }
  | { action: 'reject' };

export interface BulkSuggestQuery {
  accountIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  scope?: 'uncategorised' | 'all';
  transactionIds?: string[];
  force?: boolean;
}

@Injectable()
export class AiCategoriserService {
  constructor(private prisma: PrismaService, private ai: AiClientService) {}

  // ===== suggest =====
  async suggest(transactionId: string, opts: { force?: boolean; timeoutMs?: number } = {}): Promise<SuggestResult> {
    if (!opts.force) {
      const cached = await this.loadUnresolvedDraft(transactionId);
      if (cached) {
        // No expiry — unresolved drafts stay cached until the user accepts/edits/rejects.
        // Phase C decision: protect users from accidental re-spending on the same tx.
        return { kind: 'cached', draft: cached };
      }
    }

    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const [categories, fewShots] = await Promise.all([
      this.loadCategoriesForPrompt(),
      this.loadFewShots(),
    ]);

    const userPrompt = buildCategoriseUserPrompt({
      categories,
      fewShots,
      tx: {
        date: tx.date.toISOString().slice(0, 10),
        amount: tx.amount.toString(),
        description: tx.description,
        accountName: tx.account.name,
      },
    });

    const result = await this.ai.complete<CategoriseLlmResponse>({
      systemPrompt: CATEGORISE_SYSTEM_PROMPT,
      userPrompt,
      jsonSchema: CATEGORISE_SCHEMA,
      purpose: 'CATEGORISE',
      timeoutMs: opts.timeoutMs ?? INLINE_TIMEOUT_MS,
      contextIds: { transactionId },
    });

    if (!result.ok) {
      const msg = result.error === 'no-providers'
        ? 'AI is not configured. Add a provider at /settings/ai-setup.'
        : `Provider chain exhausted: ${result.lastError?.message ?? 'unknown error'}`;
      return { kind: 'failed', error: msg };
    }

    // Validation hardening against hallucinated ids.
    const activeCats = new Set(categories.map((c) => c.id));
    let { categoryId, confidence, reasoning } = result.data;
    if (categoryId && !activeCats.has(categoryId)) {
      return { kind: 'failed', error: 'AI returned an unknown categoryId. Try again.' };
    }
    if (reasoning.length > 200) reasoning = reasoning.slice(0, 200);

    const event = await this.prisma.categorisationEvent.create({
      data: {
        transactionId,
        source: 'AI_DRAFT',
        newCategoryId: categoryId,
        reasoning,
        providerId: result.providerId,
      },
    });

    const providerName = result.providerId
      ? (await this.prisma.aiProvider.findUnique({ where: { id: result.providerId }, select: { name: true } }))?.name ?? null
      : null;

    return {
      kind: 'fresh',
      draft: {
        eventId: event.id,
        categoryId,
        categoryName: categoryId ? categories.find((c) => c.id === categoryId)?.name ?? null : null,
        confidence,
        reasoning,
        providerId: result.providerId,
        providerName,
        createdAt: event.createdAt.toISOString(),
      },
    };
  }

  // ===== apply =====
  async apply(transactionId: string, decision: ApplyDecision): Promise<void> {
    const draft = await this.loadUnresolvedDraft(transactionId);
    if (!draft) throw new ConflictException('No pending AI draft for this transaction');

    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { categoryId: true },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    // Server-side resolution of accept vs edit when client says 'edit' but values
    // equal the AI's pick — keeps acceptedAiSuggestion honest.
    let effective = decision;
    if (decision.action === 'edit') {
      if (decision.chosenCategoryId === draft.categoryId) effective = { action: 'accept' };
    }

    await this.prisma.$transaction(async (db) => {
      if (effective.action === 'accept') {
        await db.transaction.update({
          where: { id: transactionId },
          data: {
            categoryId: draft.categoryId,
            categorisedAt: new Date(),
          },
        });
        await db.categorisationEvent.create({
          data: {
            transactionId,
            source: 'AI_APPLIED',
            acceptedAiSuggestion: true,
            oldCategoryId: tx.categoryId,
            newCategoryId: draft.categoryId,
            reasoning: draft.reasoning,
            providerId: draft.providerId,
          },
        });
      } else if (effective.action === 'edit') {
        const chosenCat = effective.chosenCategoryId;
        await db.transaction.update({
          where: { id: transactionId },
          data: { categoryId: chosenCat, categorisedAt: new Date() },
        });
        await db.categorisationEvent.create({
          data: {
            transactionId,
            source: 'AI_APPLIED',
            acceptedAiSuggestion: false,
            oldCategoryId: tx.categoryId,
            newCategoryId: chosenCat,
            reasoning: draft.reasoning,
            providerId: draft.providerId,
          },
        });
      } else {
        // reject
        await db.categorisationEvent.create({
          data: {
            transactionId,
            source: 'AI_REJECTED',
            newCategoryId: draft.categoryId,
            reasoning: draft.reasoning,
            providerId: draft.providerId,
          },
        });
      }
    });
  }

  // ===== bulk =====
  async bulkSuggest(query: BulkSuggestQuery): Promise<{ runId: string; totalQueued: number }> {
    let ids: { id: string }[];
    if (query.transactionIds?.length) {
      // Selection-based: use these IDs directly, no filter scan.
      ids = query.transactionIds.map((id) => ({ id }));
    } else {
      const where: any = {};
      if (query.accountIds?.length) where.accountId = { in: query.accountIds };
      if (query.dateFrom) where.date = { ...(where.date ?? {}), gte: new Date(query.dateFrom) };
      if (query.dateTo) where.date = { ...(where.date ?? {}), lte: new Date(query.dateTo) };
      if (query.scope === 'uncategorised') where.categoryId = null;
      ids = await this.prisma.transaction.findMany({ where, select: { id: true } });
    }

    const runId = randomUUID();
    const txIdArr = ids.map((x) => x.id);
    const run = BulkRuns.create(runId, txIdArr.length, txIdArr);

    // Fire and forget; status polled via BulkRuns.get.
    void this.runBulk(run, txIdArr, query.force ?? false);
    return { runId, totalQueued: run.totalQueued };
  }

  private async runBulk(run: { id: string; abort: AbortController; cancelled: boolean }, txIds: string[], force: boolean) {
    const r = BulkRuns.get(run.id)!;
    const limit = pLimit(BULK_CONCURRENCY);
    await Promise.all(txIds.map((id) => limit(async () => {
      if (r.cancelled) {
        r.pendingTxIds.delete(id);
        return;
      }
      try {
        const result = await this.suggest(id, { force, timeoutMs: BULK_TIMEOUT_MS });
        if (result.kind === 'fresh') r.ok++;
        else if (result.kind === 'cached') r.cached++;
        else {
          r.failed++;
          r.lastError = result.error;
        }
      } catch (e: any) {
        r.failed++;
        r.lastError = e?.message ?? String(e);
      } finally {
        r.done++;
        r.pendingTxIds.delete(id);
      }
    })));
  }

  // Used by GET /ai/bulk-suggest/active to drive the AI Review "Queue" tab.
  // Returns the most-recent in-flight run with pending transactions enriched
  // (date, amount, description) so the UI can render them in a list. Capped at
  // QUEUE_DISPLAY_CAP to keep the payload bounded on huge batches.
  async getActiveQueue(): Promise<{
    runId: string | null;
    totals: { totalQueued: number; done: number; ok: number; cached: number; failed: number };
    pending: Array<{ id: string; date: string; amount: string; description: string; accountName: string | null }>;
    pendingCount: number;
  }> {
    const run = BulkRuns.active();
    if (!run) {
      return { runId: null, totals: { totalQueued: 0, done: 0, ok: 0, cached: 0, failed: 0 }, pending: [], pendingCount: 0 };
    }
    const pendingIds = Array.from(run.pendingTxIds);
    const QUEUE_DISPLAY_CAP = 200;
    const displayIds = pendingIds.slice(0, QUEUE_DISPLAY_CAP);
    const rows = await this.prisma.transaction.findMany({
      where: { id: { in: displayIds } },
      include: { account: { select: { name: true } } },
    });
    // Preserve the original pendingIds order so the user sees items in the order they were queued.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const pending = displayIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        amount: r.amount.toString(),
        description: r.description,
        accountName: r.account?.name ?? null,
      }));
    return {
      runId: run.id,
      totals: {
        totalQueued: run.totalQueued,
        done: run.done,
        ok: run.ok,
        cached: run.cached,
        failed: run.failed,
      },
      pending,
      pendingCount: pendingIds.length,
    };
  }

  cancelActiveQueue(): { runId: string | null; cancelled: number } {
    const run = BulkRuns.active();
    if (!run) return { runId: null, cancelled: 0 };
    const remaining = run.pendingTxIds.size;
    BulkRuns.cancel(run.id);
    return { runId: run.id, cancelled: remaining };
  }

  getBulkStatus(runId: string) {
    const r = BulkRuns.get(runId);
    if (!r) throw new NotFoundException('Run not found');
    return {
      runId: r.id, totalQueued: r.totalQueued, done: r.done,
      ok: r.ok, cached: r.cached, failed: r.failed,
      cancelled: r.cancelled,
      lastError: r.lastError ?? null,
    };
  }

  cancelBulk(runId: string) {
    BulkRuns.cancel(runId);
  }

  // ===== review queue =====
  async reviewQueueCount(): Promise<{ count: number }> {
    // Count distinct transactionIds with an unresolved AI_DRAFT (no later AI_APPLIED/AI_REJECTED).
    const drafts = await this.prisma.categorisationEvent.findMany({
      where: { source: 'AI_DRAFT' },
      select: { transactionId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const latestResolutionByTx = new Map<string, Date>();
    const resolutions = await this.prisma.categorisationEvent.findMany({
      where: { source: { in: ['AI_APPLIED', 'AI_REJECTED'] } },
      select: { transactionId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    for (const r of resolutions) {
      if (!latestResolutionByTx.has(r.transactionId)) {
        latestResolutionByTx.set(r.transactionId, r.createdAt);
      }
    }
    const unresolvedTxIds = new Set<string>();
    for (const d of drafts) {
      if (unresolvedTxIds.has(d.transactionId)) continue;
      const resolution = latestResolutionByTx.get(d.transactionId);
      if (resolution && resolution > d.createdAt) continue;
      unresolvedTxIds.add(d.transactionId);
    }
    return { count: unresolvedTxIds.size };
  }

  async listReviewQueue(): Promise<AiDraftView[]> {
    // Unresolved AI_DRAFTs: most recent AI_DRAFT per transaction, with no later
    // AI_APPLIED|AI_REJECTED for that transaction.
    const drafts = await this.prisma.categorisationEvent.findMany({
      where: { source: 'AI_DRAFT' },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: { provider: { select: { id: true, name: true } } },
    });
    const resolutions = await this.prisma.categorisationEvent.findMany({
      where: { source: { in: ['AI_APPLIED', 'AI_REJECTED'] } },
      select: { transactionId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const latestResolutionByTx = new Map<string, Date>();
    for (const r of resolutions) {
      if (!latestResolutionByTx.has(r.transactionId)) {
        latestResolutionByTx.set(r.transactionId, r.createdAt);
      }
    }
    const seenTx = new Set<string>();
    const out: AiDraftView[] = [];
    const categories = await this.loadCategoriesForPrompt();
    const cat = new Map(categories.map((c) => [c.id, c.name]));
    for (const d of drafts) {
      if (seenTx.has(d.transactionId)) continue;
      const resolution = latestResolutionByTx.get(d.transactionId);
      if (resolution && resolution > d.createdAt) continue;
      seenTx.add(d.transactionId);
      out.push({
        eventId: d.id,
        categoryId: d.newCategoryId,
        categoryName: d.newCategoryId ? cat.get(d.newCategoryId) ?? null : null,
        confidence: 'med', // confidence isn't stored on the event; conservative default for the queue
        reasoning: d.reasoning ?? '',
        providerId: d.provider?.id ?? null,
        providerName: d.provider?.name ?? null,
        createdAt: d.createdAt.toISOString(),
      });
      if (out.length >= 500) break;
    }
    return out;
  }

  // ===== helpers =====
  private async loadUnresolvedDraft(transactionId: string): Promise<AiDraftView | null> {
    const draft = await this.prisma.categorisationEvent.findFirst({
      where: { transactionId, source: 'AI_DRAFT' },
      orderBy: { createdAt: 'desc' },
      include: { provider: { select: { name: true } } },
    });
    if (!draft) return null;
    const later = await this.prisma.categorisationEvent.findFirst({
      where: { transactionId, source: { in: ['AI_APPLIED', 'AI_REJECTED'] }, createdAt: { gt: draft.createdAt } },
    });
    if (later) return null;
    const cat = draft.newCategoryId
      ? await this.prisma.category.findUnique({ where: { id: draft.newCategoryId }, select: { name: true } })
      : null;
    return {
      eventId: draft.id,
      categoryId: draft.newCategoryId,
      categoryName: cat?.name ?? null,
      confidence: 'med',
      reasoning: draft.reasoning ?? '',
      providerId: draft.providerId,
      providerName: (draft as any).provider?.name ?? null,
      createdAt: draft.createdAt.toISOString(),
    };
  }

  private async loadCategoriesForPrompt() {
    const cats = await this.prisma.category.findMany({
      where: {
        isActive: true,
        children: { none: {} }, // leaves only
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { transactions: true } },
        parent: { select: { name: true } },
      },
    });
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      usageCount: c._count.transactions,
      parentName: c.parent?.name ?? null,
    }));
  }

  private async loadFewShots() {
    // Q-A qualification: USER or AI_APPLIED accepted, newCategoryId not null.
    const raw = await this.prisma.categorisationEvent.findMany({
      where: {
        OR: [
          { source: 'USER' },
          { source: 'AI_APPLIED', acceptedAiSuggestion: true },
        ],
        newCategoryId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        transaction: { select: { date: true, amount: true, description: true } },
      },
    });
    // S-B stratified: 2 per category, cap 30, ascending by date for prompt readability.
    const N_PER_CATEGORY = 2;
    const TOTAL_CAP = 30;
    const byCategory = new Map<string, typeof raw>();
    for (const e of raw) {
      const k = e.newCategoryId!;
      const arr = byCategory.get(k) ?? [];
      if (arr.length < N_PER_CATEGORY) arr.push(e);
      byCategory.set(k, arr);
    }
    const flat = Array.from(byCategory.values()).flat().slice(0, TOTAL_CAP);
    flat.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const cats = await this.prisma.category.findMany({
      where: { id: { in: flat.map((e) => e.newCategoryId!) } },
      select: { id: true, name: true },
    });
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    return flat.map((e) => ({
      date: e.transaction.date.toISOString().slice(0, 10),
      amount: e.transaction.amount.toString(),
      description: e.transaction.description,
      categoryName: catName.get(e.newCategoryId!) ?? 'Unknown',
    }));
  }
}
