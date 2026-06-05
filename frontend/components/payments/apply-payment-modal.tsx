"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyPayment, getCandidates, getCustomerCredit, listOpenInvoices } from "@/lib/payments";
import { sortActiveFirst, labelForOption } from "@/lib/sort-selectable";
import type { CandidatesResponse, Customer, CustomerCredit, Invoice, PaymentQueueItem, ScoredInvoice } from "@/lib/types";

function fmt(n: string | number) {
  return `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type LineState = { checked: boolean; amount: string };

function invoiceToScored(i: Invoice): ScoredInvoice {
  const dateStr =
    typeof i.invoiceDate === "string"
      ? i.invoiceDate.slice(0, 10)
      : new Date(i.invoiceDate).toISOString().slice(0, 10);
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    invoiceDate: dateStr,
    totalAmount: String(i.totalAmount),
    amountOutstanding: String(i.amountOutstanding),
    status: i.status,
    customerId: i.customerId ?? null,
    customerName: i.customer?.name ?? null,
    score: 0,
    signals: {
      invoiceNumber: false,
      exactAmount: false,
      customerToken: false,
      datePlausible: false,
      partialBonus: false,
    },
  };
}

// Props are a discriminated union: Context A/C ("queue" / "transaction") drive
// the modal off a PaymentQueueItem, while Context B ("invoice") drives it off
// an Invoice and lists credit-bearing transactions for that customer.
type ApplyPaymentModalProps =
  | {
      context: "queue" | "transaction";
      transaction: PaymentQueueItem;
      customers: Customer[];
      onClose: () => void;
      onApplied: () => void;
    }
  | {
      context: "invoice";
      invoice: Invoice;
      onClose: () => void;
      onApplied: () => void;
    };

export function ApplyPaymentModal(props: ApplyPaymentModalProps) {
  if (props.context === "invoice") {
    return <InvoiceContextModal invoice={props.invoice} onClose={props.onClose} onApplied={props.onApplied} />;
  }
  return (
    <TransactionContextModal
      context={props.context}
      transaction={props.transaction}
      customers={props.customers}
      onClose={props.onClose}
      onApplied={props.onApplied}
    />
  );
}

// Context A / C — the original "apply this transaction to invoices" flow.
function TransactionContextModal({
  transaction,
  customers,
  onClose,
  onApplied,
}: {
  context: "queue" | "transaction";
  transaction: PaymentQueueItem;
  customers: Customer[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [candidates, setCandidates] = useState<CandidatesResponse | null>(null);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedCustomerId, setPickedCustomerId] = useState<string>("");
  const [crossSearch, setCrossSearch] = useState("");
  const [crossResults, setCrossResults] = useState<ScoredInvoice[]>([]);
  const [credit, setCredit] = useState<CustomerCredit | null>(null);

  useEffect(() => {
    const customerId = transaction.linkedCustomerId ?? pickedCustomerId;
    if (!customerId) { setCredit(null); return; }
    void getCustomerCredit(customerId)
      .then(setCredit)
      .catch(() => setCredit(null));
  }, [transaction.linkedCustomerId, pickedCustomerId]);

  useEffect(() => {
    if (!transaction.linkedCustomerId) {
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
  }, [transaction.id, transaction.linkedCustomerId]);

  useEffect(() => {
    if (!pickedCustomerId) return;
    void listOpenInvoices("")
      .then((all) => all.filter((i) => i.customerId === pickedCustomerId))
      .then((open) => {
        setCandidates({
          candidates: open.map(invoiceToScored),
          bundleSuggestion: null,
        });
      })
      .catch((e: any) => setError(e?.message ?? "Failed to load open invoices"));
  }, [pickedCustomerId]);

  useEffect(() => {
    if (!crossSearch) {
      setCrossResults([]);
      return;
    }
    const t = setTimeout(() => {
      void listOpenInvoices(crossSearch)
        .then((all) => setCrossResults(all.map(invoiceToScored)))
        .catch((e: any) => setError(e?.message ?? "Search failed"));
    }, 250);
    return () => clearTimeout(t);
  }, [crossSearch]);

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
      await applyPayment({
        transactionId: transaction.id,
        allocations,
      });
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

          {!transaction.linkedCustomerId && !pickedCustomerId && (
            <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-2">
              <div className="text-xs">This transaction isn't linked to a customer (via category or tag). Pick one to see candidate invoices:</div>
              <Select value={pickedCustomerId} onValueChange={setPickedCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer…" /></SelectTrigger>
                <SelectContent>
                  {sortActiveFirst(customers).map((c) => <SelectItem key={c.id} value={c.id}>{labelForOption(c)}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="text-[10px] text-slate-500">
                Tip: to persist this link, set <code>customerId</code> on a Tag (in <a href="/tags" className="underline">/tags</a>) or on the transaction's Category.
              </div>
            </div>
          )}

          {candidates?.bundleSuggestion && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2">
              Looks like this pays {candidates.bundleSuggestion.invoices.length} invoices:{" "}
              {candidates.bundleSuggestion.invoices.map((i) => `INV-${i.invoiceNumber} ${fmt(i.amountOutstanding)}`).join(" + ")}
              {" = "}{fmt(candidates.bundleSuggestion.total)}
            </div>
          )}

          {credit && Number(credit.credit) > 0 && !(credit.transactions.length === 1 && credit.transactions[0].id === transaction.id) && (
            <div className="flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 p-2 text-xs">
              <span>
                Customer credit available: {fmt(credit.credit)} from {credit.transactions.length} earlier transaction{credit.transactions.length === 1 ? "" : "s"}.
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const oldest = credit.transactions[credit.transactions.length - 1];
                  onClose();
                  window.dispatchEvent(new CustomEvent("apply-payment-modal:reopen", { detail: { transactionId: oldest.id } }));
                }}
              >
                Use existing credit instead →
              </Button>
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

          <details className="rounded border border-slate-200 p-2">
            <summary className="cursor-pointer text-xs text-slate-700">▸ Apply to any invoice</summary>
            <div className="mt-2 space-y-2">
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                placeholder="Search by invoice number, customer, amount…"
                value={crossSearch}
                onChange={(e) => setCrossSearch(e.target.value)}
              />
              <ul className="max-h-48 overflow-auto divide-y divide-slate-100">
                {crossResults.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-1 text-xs">
                    <input type="checkbox" checked={!!lines[c.id]?.checked} onChange={(e) => toggle(c, e.target.checked)} />
                    <span className="font-mono w-20">INV-{c.invoiceNumber}</span>
                    <span className="flex-1 truncate text-slate-500">{c.customerName ?? "—"}</span>
                    <span className="font-mono w-24 text-right">{fmt(c.amountOutstanding)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>

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

// Context B — the inverse flow opened from the invoice view. Lists every
// transaction for the invoice's customer that still has `remaining > 0` and
// applies allocations from the selected transactions against this invoice.
function InvoiceContextModal({
  invoice,
  onClose,
  onApplied,
}: {
  invoice: Invoice;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [credit, setCredit] = useState<CustomerCredit | null>(null);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice.customerId) {
      setCredit({ credit: "0", transactions: [] });
      return;
    }
    void getCustomerCredit(invoice.customerId)
      .then(setCredit)
      .catch((e: any) => setError(e?.message ?? "Failed to load customer transactions"));
  }, [invoice.customerId]);

  function toggleTx(t: { id: string; remaining: string }, checked: boolean) {
    setLines((prev) => {
      const next = { ...prev };
      if (checked) {
        // Default the line to whatever closes the invoice or exhausts the
        // transaction's remaining balance, whichever is smaller.
        const auto = Math.min(Number(invoice.amountOutstanding), Number(t.remaining));
        next[t.id] = { checked: true, amount: auto.toFixed(2) };
      } else {
        delete next[t.id];
      }
      return next;
    });
  }

  function setLineAmount(id: string, amount: string) {
    setLines((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { checked: true, amount: "" }), amount } }));
  }

  const applied = useMemo(() => {
    let sum = 0;
    for (const v of Object.values(lines)) if (v.checked) sum += Number(v.amount || 0);
    return sum;
  }, [lines]);

  const overApplied = applied > Number(invoice.amountOutstanding) + 1e-9;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const selected = Object.entries(lines).filter(([, v]) => v.checked && Number(v.amount) > 0);
      if (selected.length === 0) {
        setError("Pick at least one transaction and set an amount > 0.");
        return;
      }
      if (overApplied) {
        setError("Applied total exceeds the invoice's outstanding balance.");
        return;
      }
      // The backend's `applyPayment` accepts a single transactionId per call,
      // so we fan out one call per selected source transaction.
      for (const [txId, v] of selected) {
        await applyPayment({
          transactionId: txId,
          allocations: [{ invoiceId: invoice.id, amount: v.amount }],
        });
      }
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
          <DialogTitle>Receive payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
            <span className="font-mono">INV-{invoice.invoiceNumber}</span>
            <span className="flex-1 truncate">{invoice.customer?.name ?? "—"}</span>
            <span>Total: {fmt(invoice.totalAmount)}</span>
            <span>Outstanding: {fmt(invoice.amountOutstanding)}</span>
          </div>

          {!credit ? (
            <div className="text-slate-500">Loading…</div>
          ) : credit.transactions.length === 0 ? (
            <div className="text-slate-500">No customer transactions with remaining balance.</div>
          ) : (
            <ul className="divide-y divide-slate-200 rounded border border-slate-200">
              {credit.transactions.map((t) => {
                const line = lines[t.id];
                return (
                  <li key={t.id} className="flex items-center gap-2 p-2">
                    <input
                      type="checkbox"
                      checked={!!line?.checked}
                      onChange={(e) => toggleTx(t, e.target.checked)}
                    />
                    <span className="font-mono w-24 text-xs text-slate-500">{t.date.slice(0, 10)}</span>
                    <span className="flex-1 truncate">{t.description}</span>
                    <span className="font-mono w-24 text-right">{fmt(t.remaining)}</span>
                    <input
                      className="w-24 rounded border border-slate-300 px-2 py-1 font-mono text-right"
                      value={line?.amount ?? ""}
                      disabled={!line?.checked}
                      onChange={(e) => setLineAmount(t.id, e.target.value)}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-between rounded bg-slate-50 p-2 text-xs">
            <span>Applied: {fmt(applied)} of {fmt(invoice.amountOutstanding)} outstanding</span>
            {overApplied && <span className="text-rose-700">Exceeds outstanding</span>}
          </div>
          {error && <div className="text-rose-700">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || applied === 0 || overApplied}>
            {submitting ? "Applying…" : `Apply ${fmt(applied)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
