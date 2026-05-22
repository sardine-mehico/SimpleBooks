"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bulkSuggest, bulkSuggestCancel, bulkSuggestStatus } from "@/lib/ai";
import type { Account, BulkRunStatus } from "@/lib/types";

export function BulkAiCategoriseDialog({
  accounts,
  open,
  onClose,
}: {
  accounts: Account[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<'uncategorised' | 'all'>('uncategorised');
  const [accountId, setAccountId] = useState<string>('__all__');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<BulkRunStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!runId) return;
    const t = setInterval(async () => {
      try {
        const s = await bulkSuggestStatus(runId);
        setStatus(s);
        if (s.done >= s.totalQueued || s.cancelled) clearInterval(t);
      } catch { clearInterval(t); }
    }, 1000);
    return () => clearInterval(t);
  }, [runId]);

  async function start() {
    setBusy(true);
    try {
      const r = await bulkSuggest({
        accountIds: accountId === '__all__' ? undefined : [accountId],
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        scope,
      });
      setRunId(r.runId);
      setStatus({ runId: r.runId, totalQueued: r.totalQueued, done: 0, ok: 0, cached: 0, failed: 0, cancelled: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (runId && status && status.done < status.totalQueued && !status.cancelled) {
      await bulkSuggestCancel(runId);
    }
    onClose();
  }

  const done = status && status.done >= status.totalQueued;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Categorise with AI</DialogTitle></DialogHeader>
        {!runId && (
          <div className="space-y-3">
            <Field label="Scope">
              <Select value={scope} onValueChange={(v) => setScope(v as 'uncategorised' | 'all')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="uncategorised">Uncategorised only</SelectItem>
                  <SelectItem value="all">All transactions</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Account">
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All accounts</SelectItem>
                  {accounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><input type="date" className="rounded-[0.3rem] border border-slate-300 px-2 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
              <Field label="To"><input type="date" className="rounded-[0.3rem] border border-slate-300 px-2 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
            </div>
            <p className="text-xs text-slate-500">Approximately 1 AI call per transaction. Costs depend on your provider.</p>
          </div>
        )}
        {runId && status && (
          <div className="space-y-2 py-2 text-sm">
            <div>Queued: <span className="font-mono">{status.totalQueued}</span></div>
            <div>Done: <span className="font-mono">{status.done}</span> · OK: <span className="font-mono text-emerald-700">{status.ok}</span> · Cached: <span className="font-mono text-slate-500">{status.cached}</span> · Failed: <span className="font-mono text-rose-700">{status.failed}</span></div>
            {done && (
              <div className="pt-2">
                <Button onClick={() => { onClose(); router.push(`/transactions/ai-review?runId=${runId}`); }}>Review now</Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {!runId && <>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Start'}</Button>
          </>}
          {runId && !done && <Button variant="ghost" onClick={handleClose}>Cancel run</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
