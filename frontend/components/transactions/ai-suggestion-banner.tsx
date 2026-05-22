// frontend/components/transactions/ai-suggestion-banner.tsx
"use client";

import { useEffect, useState } from "react";
import { Sparkles, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyAiSuggestion, suggestCategory } from "@/lib/ai";
import type { AiDraftView, SuggestResult } from "@/lib/types";

type Mode = 'idle' | 'loading' | 'suggestion' | 'edit-collapsed' | 'failed-no-providers' | 'failed-chain' | 'hidden';

export function AiSuggestionBanner({
  transactionId,
  auto,
  onAccepted,
  onRejected,
  onEditMode,
  onDraftLoaded,
}: {
  transactionId: string;
  auto: boolean;            // true = call /suggest-category on mount; false = show "Ask AI" link
  onAccepted: () => void;   // close modal
  onRejected: () => void;   // banner hides, modal stays open
  onEditMode: (draft: AiDraftView) => void;  // parent pre-fills Category select
  onDraftLoaded?: (draft: AiDraftView | null) => void;
}) {
  const [mode, setMode] = useState<Mode>(auto ? 'loading' : 'idle');
  const [draft, setDraft] = useState<AiDraftView | null>(null);
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auto) return;
    void fetchSuggestion(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchSuggestion(force: boolean) {
    setMode('loading');
    try {
      const r: SuggestResult = await suggestCategory(transactionId, { force });
      if (r.kind === 'failed') {
        if (r.error.toLowerCase().includes('not configured')) setMode('failed-no-providers');
        else { setError(r.error); setMode('failed-chain'); }
        setDraft(null);
        onDraftLoaded?.(null);
        return;
      }
      setDraft(r.draft);
      setMode('suggestion');
      onDraftLoaded?.(r.draft);
    } catch (e: any) {
      setError(e?.message ?? 'unknown error');
      setMode('failed-chain');
    }
  }

  async function doApply(action: 'accept' | 'reject') {
    if (!draft && action !== 'reject') return;
    setBusy(true);
    try {
      await applyAiSuggestion(transactionId, { action } as any);
      if (action === 'accept') onAccepted();
      else { setMode('hidden'); onRejected(); }
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'hidden') return null;
  if (mode === 'idle' && !auto) {
    return (
      <button
        type="button"
        className="text-xs text-indigo-700 hover:underline"
        onClick={() => fetchSuggestion(true)}
      >
        Ask AI for a different opinion
      </button>
    );
  }
  if (mode === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <Sparkles className="h-4 w-4 animate-pulse" /> Asking AI…
      </div>
    );
  }
  if (mode === 'failed-no-providers') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertCircle className="mt-0.5 h-4 w-4" />
        <div>AI is not configured. <a className="font-medium underline" href="/settings/ai-setup">Set up providers</a></div>
      </div>
    );
  }
  if (mode === 'failed-chain') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
        <AlertCircle className="mt-0.5 h-4 w-4" />
        <div className="flex-1">{error}</div>
        <Button size="sm" variant="outline" onClick={() => fetchSuggestion(true)} disabled={busy}>Retry</Button>
      </div>
    );
  }
  if (mode === 'edit-collapsed' && draft) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
        <Sparkles className="h-3 w-3" />
        <span>You're overriding AI's suggestion ({draft.categoryName ?? '—'}). Save to apply.</span>
        <button type="button" className="ml-auto" onClick={() => doApply('reject')}><X className="h-3 w-3" /></button>
      </div>
    );
  }
  if (mode === 'suggestion' && draft) {
    const tone = draft.confidence === 'high' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : draft.confidence === 'med'   ? 'border-amber-200   bg-amber-50   text-amber-900'
              :                                 'border-slate-200   bg-slate-50   text-slate-700';
    return (
      <div className={`rounded-lg border p-3 text-sm ${tone}`}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="font-medium">AI suggests:</span>
          <span>{draft.categoryName ?? '— uncategorised —'}</span>
          {draft.vendorName && <span className="text-xs opacity-80">· Vendor: {draft.vendorName}</span>}
          <span className="ml-2 rounded bg-white/60 px-1.5 py-0.5 text-[10px] uppercase">{draft.confidence}</span>
        </div>
        {draft.reasoning && <div className="mt-1 italic text-xs opacity-80">"{draft.reasoning}"</div>}
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => doApply('accept')} disabled={busy || !draft.categoryId}>Accept</Button>
          <Button size="sm" variant="outline" onClick={() => { setMode('edit-collapsed'); onEditMode(draft); }} disabled={busy}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => doApply('reject')} disabled={busy}>Reject</Button>
        </div>
      </div>
    );
  }
  return null;
}
