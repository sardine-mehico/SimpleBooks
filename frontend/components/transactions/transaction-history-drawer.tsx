"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Category } from "@/lib/types";

interface EventRow {
  id: string;
  source: 'USER' | 'RULE' | 'AI_DRAFT' | 'AI_APPLIED' | 'AI_REJECTED' | 'AUTO_ALIAS';
  acceptedAiSuggestion: boolean | null;
  oldCategoryId: string | null;
  newCategoryId: string | null;
  reasoning: string | null;
  rule: { id: string; name: string } | null;
  createdAt: string;
}

const TONE: Record<string, string> = {
  USER: 'bg-slate-100 text-slate-700',
  RULE: 'bg-indigo-100 text-indigo-800',
  AI_DRAFT: 'bg-amber-50 text-amber-800',
  AI_APPLIED_TRUE: 'bg-emerald-100 text-emerald-800',
  AI_APPLIED_FALSE: 'bg-amber-100 text-amber-900',
  AI_REJECTED: 'bg-rose-100 text-rose-800',
  AUTO_ALIAS: 'bg-cyan-100 text-cyan-800',
};

function badgeFor(e: EventRow) {
  if (e.source === 'AI_APPLIED') return e.acceptedAiSuggestion ? 'AI_APPLIED_TRUE' : 'AI_APPLIED_FALSE';
  return e.source;
}

export function TransactionHistoryDrawer({
  transactionId,
  open,
  onClose,
  categories,
}: {
  transactionId: string;
  open: boolean;
  onClose: () => void;
  categories: Category[];
}) {
  const [events, setEvents] = useState<EventRow[]>([]);
  useEffect(() => {
    if (!open) return;
    void api<EventRow[]>(`/categorisation-events?transactionId=${transactionId}&limit=50`).then(setEvents);
  }, [open, transactionId]);

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-[420px] overflow-y-auto rounded-l-lg border-l border-slate-200 bg-white p-4 shadow-xl">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">History</h3>
          <button type="button" className="text-sm text-slate-500" onClick={onClose}>Close</button>
        </header>
        {events.length === 0 ? (
          <p className="text-xs text-slate-400">No history yet. This transaction hasn&apos;t been touched by anything but its CSV import.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${TONE[badgeFor(e)]}`}>{e.source}{e.source === 'AI_APPLIED' ? (e.acceptedAiSuggestion ? ' · accepted' : ' · edited') : ''}</span>
                  <span className="text-[10px] text-slate-400">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                {(e.oldCategoryId !== e.newCategoryId) && (e.oldCategoryId || e.newCategoryId) && (
                  <div className="mt-1">Category: <span className="font-mono">{catName.get(e.oldCategoryId ?? '') ?? '—'}</span> → <span className="font-mono">{catName.get(e.newCategoryId ?? '') ?? '—'}</span></div>
                )}
                {e.reasoning && <div className="mt-1 italic text-slate-600">&ldquo;{e.reasoning}&rdquo;</div>}
                {e.rule && <div className="mt-1"><a className="text-indigo-700 underline" href={`/rules/${e.rule.id}/edit`}>rule: &ldquo;{e.rule.name}&rdquo;</a></div>}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </>
  );
}
