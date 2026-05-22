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
const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface AiDraftView {
  eventId: string;
  categoryId: string | null;
  categoryName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  confidence: AiConfidence;
  reasoning: string;
  providerId: string | null;
  createdAt: string;
}

export type SuggestResult =
  | { kind: 'fresh'; draft: AiDraftView }
  | { kind: 'cached'; draft: AiDraftView }
  | { kind: 'failed'; error: string };

export type ApplyDecision =
  | { action: 'accept' }
  | { action: 'edit'; chosenCategoryId: string; chosenVendorId?: string | null }
  | { action: 'reject' };

export interface BulkSuggestQuery {
  accountIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  scope: 'uncategorised' | 'all';
}

@Injectable()
export class AiCategoriserService {
  constructor(private prisma: PrismaService, private ai: AiClientService) {}

  // ===== suggest =====
  async suggest(transactionId: string, opts: { force?: boolean; timeoutMs?: number } = {}): Promise<SuggestResult> {
    if (!opts.force) {
      const cached = await this.loadUnresolvedDraft(transactionId);
      if (cached && Date.now() - new Date(cached.createdAt).getTime() < CACHE_WINDOW_MS) {
        return { kind: 'cached', draft: cached };
      }
    }

    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const [categories, vendors, fewShots] = await Promise.all([
      this.loadCategoriesForPrompt(),
      this.loadVendorsForPrompt(),
      this.loadFewShots(),
    ]);

    const userPrompt = buildCategoriseUserPrompt({
      categories,
      vendors,
      fewShots,
      tx: {
        date: tx.date.toISOString().slice(0, 10),
        amount: tx.amount.toString(),
        description: tx.description,
        vendorGuess: vendors.find((v) => v.id === tx.vendorId)?.name ?? null,
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
    const activeVens = new Set(vendors.map((v) => v.id));
    let { categoryId, vendorId, confidence, reasoning } = result.data;
    if (categoryId && !activeCats.has(categoryId)) {
      return { kind: 'failed', error: 'AI returned an unknown categoryId. Try again.' };
    }
    if (vendorId && !activeVens.has(vendorId)) vendorId = null;
    if (reasoning.length > 200) reasoning = reasoning.slice(0, 200);

    const event = await this.prisma.categorisationEvent.create({
      data: {
        transactionId,
        source: 'AI_DRAFT',
        newCategoryId: categoryId,
        newVendorId: vendorId,
        reasoning,
      },
    });

    return {
      kind: 'fresh',
      draft: {
        eventId: event.id,
        categoryId,
        categoryName: categoryId ? categories.find((c) => c.id === categoryId)?.name ?? null : null,
        vendorId,
        vendorName: vendorId ? vendors.find((v) => v.id === vendorId)?.name ?? null : null,
        confidence,
        reasoning,
        providerId: result.providerId,
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
      select: { categoryId: true, vendorId: true },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    // Server-side resolution of accept vs edit when client says 'edit' but values
    // equal the AI's pick — keeps acceptedAiSuggestion honest.
    let effective = decision;
    if (decision.action === 'edit') {
      const sameCat = decision.chosenCategoryId === draft.categoryId;
      const sameVen = (decision.chosenVendorId ?? null) === (draft.vendorId ?? null);
      if (sameCat && sameVen) effective = { action: 'accept' };
    }

    await this.prisma.$transaction(async (db) => {
      if (effective.action === 'accept') {
        await db.transaction.update({
          where: { id: transactionId },
          data: {
            categoryId: draft.categoryId,
            vendorId: draft.vendorId ?? tx.vendorId,
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
            oldVendorId: tx.vendorId,
            newVendorId: draft.vendorId,
            reasoning: draft.reasoning,
          },
        });
      } else if (effective.action === 'edit') {
        const chosenCat = effective.chosenCategoryId;
        const chosenVen = effective.chosenVendorId ?? null;
        await db.transaction.update({
          where: { id: transactionId },
          data: { categoryId: chosenCat, vendorId: chosenVen, categorisedAt: new Date() },
        });
        await db.categorisationEvent.create({
          data: {
            transactionId,
            source: 'AI_APPLIED',
            acceptedAiSuggestion: false,
            oldCategoryId: tx.categoryId,
            newCategoryId: chosenCat,
            oldVendorId: tx.vendorId,
            newVendorId: chosenVen,
            reasoning: draft.reasoning,
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
          },
        });
      }
    });
  }

  // ===== bulk =====
  async bulkSuggest(query: BulkSuggestQuery): Promise<{ runId: string; totalQueued: number }> {
    const where: any = {};
    if (query.accountIds?.length) where.accountId = { in: query.accountIds };
    if (query.dateFrom) where.date = { ...(where.date ?? {}), gte: new Date(query.dateFrom) };
    if (query.dateTo) where.date = { ...(where.date ?? {}), lte: new Date(query.dateTo) };
    if (query.scope === 'uncategorised') where.categoryId = null;

    const ids = await this.prisma.transaction.findMany({ where, select: { id: true } });
    const runId = randomUUID();
    const run = BulkRuns.create(runId, ids.length);

    // Fire and forget; status polled via BulkRuns.get.
    void this.runBulk(run, ids.map((x) => x.id));
    return { runId, totalQueued: run.totalQueued };
  }

  private async runBulk(run: { id: string; abort: AbortController; cancelled: boolean }, txIds: string[]) {
    const r = BulkRuns.get(run.id)!;
    const limit = pLimit(BULK_CONCURRENCY);
    await Promise.all(txIds.map((id) => limit(async () => {
      if (r.cancelled) return;
      try {
        const result = await this.suggest(id, { force: false, timeoutMs: BULK_TIMEOUT_MS });
        if (result.kind === 'fresh') r.ok++;
        else if (result.kind === 'cached') r.cached++;
        else r.failed++;
      } catch {
        r.failed++;
      } finally {
        r.done++;
      }
    })));
  }

  getBulkStatus(runId: string) {
    const r = BulkRuns.get(runId);
    if (!r) throw new NotFoundException('Run not found');
    return { runId: r.id, totalQueued: r.totalQueued, done: r.done, ok: r.ok, cached: r.cached, failed: r.failed, cancelled: r.cancelled };
  }

  cancelBulk(runId: string) {
    BulkRuns.cancel(runId);
  }

  // ===== review queue =====
  async listReviewQueue(): Promise<AiDraftView[]> {
    // Unresolved AI_DRAFTs: most recent AI_DRAFT per transaction, with no later
    // AI_APPLIED|AI_REJECTED for that transaction.
    const drafts = await this.prisma.categorisationEvent.findMany({
      where: { source: 'AI_DRAFT' },
      orderBy: { createdAt: 'desc' },
      take: 1000,
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
    const [categories, vendors] = await Promise.all([this.loadCategoriesForPrompt(), this.loadVendorsForPrompt()]);
    const cat = new Map(categories.map((c) => [c.id, c.name]));
    const ven = new Map(vendors.map((v) => [v.id, v.name]));
    for (const d of drafts) {
      if (seenTx.has(d.transactionId)) continue;
      const resolution = latestResolutionByTx.get(d.transactionId);
      if (resolution && resolution > d.createdAt) continue;
      seenTx.add(d.transactionId);
      out.push({
        eventId: d.id,
        categoryId: d.newCategoryId,
        categoryName: d.newCategoryId ? cat.get(d.newCategoryId) ?? null : null,
        vendorId: d.newVendorId,
        vendorName: d.newVendorId ? ven.get(d.newVendorId) ?? null : null,
        confidence: 'med', // confidence isn't stored on the event; conservative default for the queue
        reasoning: d.reasoning ?? '',
        providerId: null,
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
    });
    if (!draft) return null;
    const later = await this.prisma.categorisationEvent.findFirst({
      where: { transactionId, source: { in: ['AI_APPLIED', 'AI_REJECTED'] }, createdAt: { gt: draft.createdAt } },
    });
    if (later) return null;
    const cat = draft.newCategoryId
      ? await this.prisma.category.findUnique({ where: { id: draft.newCategoryId }, select: { name: true } })
      : null;
    const ven = draft.newVendorId
      ? await this.prisma.vendor.findUnique({ where: { id: draft.newVendorId }, select: { name: true } })
      : null;
    return {
      eventId: draft.id,
      categoryId: draft.newCategoryId,
      categoryName: cat?.name ?? null,
      vendorId: draft.newVendorId,
      vendorName: ven?.name ?? null,
      confidence: 'med',
      reasoning: draft.reasoning ?? '',
      providerId: null,
      createdAt: draft.createdAt.toISOString(),
    };
  }

  private async loadCategoriesForPrompt() {
    const cats = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { transactions: true } } },
    });
    return cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind, usageCount: c._count.transactions }));
  }

  private async loadVendorsForPrompt() {
    const vens = await this.prisma.vendor.findMany({
      where: { isActive: true },
      include: { _count: { select: { transactions: true } } },
      orderBy: { name: 'asc' },
    });
    return vens
      .sort((a, b) => b._count.transactions - a._count.transactions)
      .slice(0, 50)
      .map((v) => ({ id: v.id, name: v.name, aliases: v.aliases }));
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
