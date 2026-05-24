"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { applyPayment, getCandidates } from "@/lib/payments";
import type { CandidatesResponse, PaymentQueueItem, ScoredInvoice } from "@/lib/types";

function fmt(n: string | number) {
  return `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type LineState = { checked: boolean; amount: string };

export function ApplyPaymentModal({
  context,
  transaction,
  onClose,
  onApplied,
}: {
  context: "queue" | "invoice" | "transaction";
  transaction: PaymentQueueItem;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [candidates, setCandidates] = useState<CandidatesResponse | null>(null);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transaction.vendorCustomerId) {
      setCandidates({ candidates: [], bundleSuggestion: null });
      return;
    }
    void getCandidates(transaction.id).then((r) => {
      setCandidates(r);
      if (r.bundleSuggestion) {
        const seed: Record<string, LineState> = {};
        for (const b of r.bundleSuggestion.invoices) {
          seed[b.id] = { checked: true, amount: b.amountOutstanding };
        }
        setLines(seed);
      }
    }).catch((e: any) => setError(e?.message ?? "Failed to load candidates"));
  }, [transaction.id, transaction.vendorCustomerId]);

  function toggle(c: ScoredInvoice, checked: boolean) {
    setLines((prev) => {
      const next = { ...prev };
      if (checked) {
        const auto = Number(transaction.unallocated) < Number(c.amountOutstanding)
          ? transaction.unallocated
          : c.amountOutstanding;
        next[c.id] = { checked: true, amount: auto };
      } else {
        delete next[c.id];
      }
      return next;
    });
  }

  function setAmount(id: string, amount: string) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], amount } }));
  }

  const totals = useMemo(() => {
    let applied = 0;
    for (const v of Object.values(lines)) if (v.checked) applied += Number(v.amount || 0);
    const remaining = Math.max(Number(transaction.unallocated) - applied, 0);
    const credit = remaining;
    return { applied, remaining, credit };
  }, [lines, transaction.unallocated]);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const allocations = Object.entries(lines)
        .filter(([, v]) => v.checked && Number(v.amount) > 0)
        .map(([invoiceId, v]) => ({ invoiceId, amount: v.amount }));
      if (allocations.length === 0) {
        setError("Pick at least one invoice and set an amount > 0.");
        return;
      }
      await applyPayment({ transactionId: transaction.id, allocations });
      onApplied();
    } catch (e: any) {
      setError(e?.message ?? "Apply failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
            <span className="font-mono">{transaction.date}</span>
            <span className="font-mono font-semibold">{fmt(transaction.amount)}</span>
            <span className="flex-1 truncate">{transaction.description}</span>
            <span>{transaction.accountName}</span>
          </div>

          {candidates?.bundleSuggestion && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2">
              Looks like this pays {candidates.bundleSuggestion.invoices.length} invoices:{" "}
              {candidates.bundleSuggestion.invoices.map((i) => `INV-${i.invoiceNumber} ${fmt(i.amountOutstanding)}`).join(" + ")}
              {" = "}{fmt(candidates.bundleSuggestion.total)}
            </div>
          )}

          {!candidates ? (
            <div className="text-slate-500">Loading…</div>
          ) : candidates.candidates.length === 0 ? (
            <div className="text-slate-500">No open invoices for this customer.</div>
          ) : (
            <ul className="divide-y divide-slate-200 rounded border border-slate-200">
              {candidates.candidates.map((c) => {
                const line = lines[c.id];
                return (
                  <li key={c.id} className="flex items-center gap-2 p-2">
                    <input
                      type="checkbox"
                      checked={!!line?.checked}
                      onChange={(e) => toggle(c, e.target.checked)}
                    />
                    <span className="font-mono w-20">INV-{c.invoiceNumber}</span>
                    <span className="font-mono w-24 text-xs text-slate-500">{c.invoiceDate}</span>
                    <span className="font-mono w-24 text-right">{fmt(c.amountOutstanding)}</span>
                    <input
                      className="ml-auto w-24 rounded border border-slate-300 px-2 py-1 font-mono text-right"
                      value={line?.amount ?? ""}
                      disabled={!line?.checked}
                      onChange={(e) => setAmount(c.id, e.target.value)}
                    />
                    <span
                      className="text-xs text-slate-500"
                      title={`+${c.signals.invoiceNumber ? 60 : 0} invoice# · +${c.signals.exactAmount ? 40 : 0} exact · +${c.signals.customerToken ? 15 : 0} customer · +${c.signals.datePlausible ? 10 : 0} date · +${c.signals.partialBonus ? 5 : 0} partial`}
                    >
                      {c.score}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-between rounded bg-slate-50 p-2 text-xs">
            <span>Applied: {fmt(totals.applied)}</span>
            <span>Remaining: {fmt(totals.remaining)}</span>
            <span>Credit to customer: {fmt(totals.credit)}</span>
          </div>
          {error && <div className="text-rose-700">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSubmit} disabled={submitting || totals.applied === 0}>
            {submitting ? "Applying…" : `Apply ${fmt(totals.applied)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
