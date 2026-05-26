"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Sparkles, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { applyAiSuggestion, bulkSuggestStatus, cancelActiveBulkQueue, getActiveBulkQueue, listReviewQueue, type ActiveBulkQueue } from "@/lib/ai";
import { listCategories } from "@/lib/banking-rules";
import type { AiDraftView, BulkRunStatus, Category, Customer, Transaction, Vendor } from "@/lib/types";
import { api } from "@/lib/api";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { TransactionEditModal } from "./transaction-edit-modal";

type FullTransaction = Transaction & {
  account?: { id: string; name: string };
  splits?: Array<{ id: string; categoryId: string; amount: string | number; notes?: string | null }>;
};

export function AiReviewList({ categories, vendors }: { categories: Category[]; vendors: Vendor[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const runId = sp.get("runId");
  const [runStatus, setRunStatus] = useState<BulkRunStatus | null>(null);
  const [drafts, setDrafts] = useState<AiDraftView[]>([]);
  const [txMap, setTxMap] = useState<Map<string, FullTransaction>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<FullTransaction | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [parents, setParents] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tab, setTab] = useState<'review' | 'queue'>(sp.get('tab') === 'queue' ? 'queue' : 'review');
  const [queue, setQueue] = useState<ActiveBulkQueue | null>(null);
  const [cancellingQueue, setCancellingQueue] = useState(false);

  useEffect(() => {
    listCategories().then((cs) =>
      setParents(cs.filter((c) => c.parentId === null && c.kind !== 'TRANSFER')),
    );
    api<Customer[]>('/customers').then(setCustomers).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    if (!runId) return;
    void bulkSuggestStatus(runId).then(setRunStatus).catch(() => {/* run may have been swept */});
  }, [runId]);

  // Poll the active bulk-run queue. Faster cadence (2s) when a run is active,
  // slow (10s) when idle so we still notice a fresh run kicking off.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const q = await getActiveBulkQueue();
        if (cancelled) return;
        setQueue(q);
        const next = q.runId ? 2000 : 10000;
        timer = setTimeout(tick, next);
      } catch {
        if (cancelled) return;
        timer = setTimeout(tick, 10000);
      }
    }
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  async function onCancelQueue() {
    if (!queue?.runId) return;
    if (!confirm(`Cancel ${queue.pendingCount} pending transaction${queue.pendingCount === 1 ? '' : 's'} in the AI queue?`)) return;
    setCancellingQueue(true);
    try {
      await cancelActiveBulkQueue();
      // Refresh immediately so the UI reflects the cancel right away.
      const q = await getActiveBulkQueue();
      setQueue(q);
    } finally {
      setCancellingQueue(false);
    }
  }

  async function refresh() {
    const q = await listReviewQueue();
    setDrafts(q);
    if (q.length) {
      const tx = await Promise.all(q.map((d) => api<FullTransaction>(`/transactions/by-event/${d.eventId}`).catch(() => null)));
      const m = new Map<string, FullTransaction>();
      for (let i = 0; i < q.length; i++) if (tx[i]) m.set(q[i].eventId, tx[i]!);
      setTxMap(m);
    } else {
      setTxMap(new Map());
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function act(draft: AiDraftView, action: 'accept' | 'reject') {
    setBusy(draft.eventId);
    try {
      const tx = txMap.get(draft.eventId);
      if (!tx) return;
      await applyAiSuggestion(tx.id, { action });
      setDrafts((d) => d.filter((x) => x.eventId !== draft.eventId));
    } catch (e: any) {
      alert(`Failed to ${action}: ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  }

  function openEdit(draft: AiDraftView) {
    const tx = txMap.get(draft.eventId);
    if (!tx) return;
    setEditingTx(tx);
    setEditingEventId(draft.eventId);
  }

  function closeEdit() {
    setEditingTx(null);
    setEditingEventId(null);
  }

  const grouped = useMemo(() => drafts, [drafts]);

  return (
    <div className="space-y-3">
      {runStatus && runStatus.failed > 0 && runStatus.lastError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <div className="font-medium">
            {runStatus.failed} transaction{runStatus.failed === 1 ? '' : 's'} failed in the last AI run
          </div>
          <div className="mt-1 italic text-xs">{runStatus.lastError}</div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Link href="/transactions" className="text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-lg font-semibold">AI Review</h1>
        <div className="ml-auto flex items-center gap-2">
          {tab === 'review' && (
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Add Category
            </Button>
          )}
          {tab === 'queue' && queue?.runId && queue.pendingCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancelQueue}
              disabled={cancellingQueue}
              className="border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              {cancellingQueue ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Cancel All
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('review')}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab === 'review'
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          Review <span className="ml-1 text-xs text-slate-400">({grouped.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('queue')}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab === 'queue'
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          Queue
          {queue?.runId && queue.pendingCount > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 text-xs">
              <Loader2 className="h-3 w-3 animate-spin text-indigo-600" />
              <span className="text-indigo-700">{queue.pendingCount}</span>
            </span>
          )}
        </button>
      </div>

      {tab === 'queue' && (
        <QueuePanel queue={queue} />
      )}

      {tab === 'review' && grouped.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Nothing for AI to review. Categorise some transactions with rules and try the bulk action on <Link href="/transactions" className="underline">/transactions</Link>.
        </div>
      )}

      {tab === 'review' && grouped.map((d) => {
        const tx = txMap.get(d.eventId);
        const tone = d.confidence === 'high' ? 'border-emerald-200 bg-emerald-50'
                  : d.confidence === 'med'   ? 'border-amber-200   bg-amber-50'
                  :                             'border-slate-200   bg-slate-50';
        return (
          <div key={d.eventId} className="rounded-lg border border-slate-200 bg-white p-3">
            {tx && (
              <div className="mb-2 text-sm">
                <span className="font-mono">{tx.date.slice(0, 10)}</span> ·{' '}
                <span className="font-mono">{Number(tx.amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span> ·{' '}
                <span>{tx.description}</span> · <span className="text-xs text-slate-500">{tx.account?.name}</span>
              </div>
            )}
            <div className={`rounded-lg border p-2 text-sm ${tone}`}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span>AI suggests: <strong>{d.categoryName ?? '— uncategorised —'}</strong></span>
                {d.vendorName && <span className="text-xs">· Vendor: {d.vendorName}</span>}
                <span className="ml-2 rounded bg-white/60 px-1.5 py-0.5 text-[10px] uppercase">{d.confidence}</span>
              </div>
              {d.reasoning && <div className="mt-1 italic text-xs opacity-80">&ldquo;{d.reasoning}&rdquo;</div>}
              <div className="mt-1 text-xs text-slate-500 italic">
                Suggested by {d.providerName ?? 'AI'} · {new Date(d.createdAt).toLocaleString()}
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => act(d, 'accept')} disabled={busy === d.eventId || !d.categoryId}>Accept</Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(d)} disabled={busy === d.eventId || !tx}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => act(d, 'reject')} disabled={busy === d.eventId}>Reject</Button>
              </div>
            </div>
          </div>
        );
      })}

      {editingTx && (
        <TransactionEditModal
          transaction={editingTx}
          categories={categories}
          vendors={vendors}
          aiReviewMode
          onClose={closeEdit}
          onManageSplits={closeEdit}
          onAiReviewResolved={() => {
            if (editingEventId) {
              setDrafts((d) => d.filter((x) => x.eventId !== editingEventId));
            }
          }}
        />
      )}

      <CategoryFormDialog
        key={dialogOpen ? "open" : "closed"}
        open={dialogOpen}
        parents={parents}
        customers={customers}
        defaultParentId={null}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          router.refresh();
          listCategories().then((cs) =>
            setParents(cs.filter((c) => c.parentId === null && c.kind !== 'TRANSFER')),
          );
        }}
      />
    </div>
  );
}

function QueuePanel({ queue }: { queue: ActiveBulkQueue | null }) {
  if (!queue || !queue.runId) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
        <div className="font-medium text-slate-600">Nothing in the AI queue</div>
        <div className="mt-1">
          Trigger a bulk run from <Link href="/transactions" className="underline">/transactions</Link> using
          the &ldquo;Categorise with AI&rdquo; action.
        </div>
      </div>
    );
  }
  const { totals, pending, pendingCount } = queue;
  const truncated = pendingCount > pending.length;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <span className="text-slate-500">Total queued:</span>{' '}
            <span className="font-semibold tabular-nums">{totals.totalQueued}</span>
          </div>
          <div>
            <span className="text-slate-500">Done:</span>{' '}
            <span className="font-semibold tabular-nums">{totals.done}</span>
            {' · '}
            <span className="text-emerald-700 tabular-nums">OK: {totals.ok}</span>
            {' · '}
            <span className="text-slate-600 tabular-nums">Cached: {totals.cached}</span>
            {totals.failed > 0 && (
              <>
                {' · '}
                <span className="text-rose-700 tabular-nums">Failed: {totals.failed}</span>
              </>
            )}
          </div>
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            <Loader2 className="h-3 w-3 animate-spin" />
            {pendingCount} pending
          </div>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
          All transactions for this run have been processed. Drafts will appear on the Review tab.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Account</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{p.date}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {Number(p.amount).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1.5">{p.description}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-500">{p.accountName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {truncated && (
            <div className="border-t border-slate-100 px-3 py-2 text-xs italic text-slate-500">
              showing first {pending.length} of {pendingCount} pending — the rest will keep processing in the background
            </div>
          )}
        </div>
      )}
    </div>
  );
}
