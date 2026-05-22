"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyAiSuggestion, listReviewQueue } from "@/lib/ai";
import type { AiDraftView, Transaction } from "@/lib/types";
import { api } from "@/lib/api";

export function AiReviewList() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<AiDraftView[]>([]);
  const [txMap, setTxMap] = useState<Map<string, Transaction & { account?: { name: string } }>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const q = await listReviewQueue();
    setDrafts(q);
    if (q.length) {
      const tx = await Promise.all(q.map((d) => api<Transaction & { account?: { name: string } }>(`/transactions/by-event/${d.eventId}`).catch(() => null)));
      const m = new Map<string, Transaction & { account?: { name: string } }>();
      for (let i = 0; i < q.length; i++) if (tx[i]) m.set(q[i].eventId, tx[i]!);
      setTxMap(m);
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
    } finally {
      setBusy(null);
    }
  }

  const grouped = useMemo(() => drafts, [drafts]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link href="/transactions" className="text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-lg font-semibold">AI Review ({grouped.length} pending)</h1>
      </div>

      {grouped.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Nothing for AI to review. Categorise some transactions with rules and try the bulk action on <Link href="/transactions" className="underline">/transactions</Link>.
        </div>
      )}

      {grouped.map((d) => {
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
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => act(d, 'accept')} disabled={busy === d.eventId || !d.categoryId}>Accept</Button>
                <Button size="sm" variant="outline" onClick={() => tx && router.push(`/transactions?edit=${tx.id}`)} disabled={busy === d.eventId}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => act(d, 'reject')} disabled={busy === d.eventId}>Reject</Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
