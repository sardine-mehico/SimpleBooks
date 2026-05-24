"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissPayment, listPaymentsQueue } from "@/lib/payments";
import type { PaymentQueueItem } from "@/lib/types";
import { ApplyPaymentModal } from "./apply-payment-modal";

function fmtAmount(n: string) {
  return `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PaymentsQueue({
  initialItems,
  initialShowAll,
}: {
  initialItems: PaymentQueueItem[];
  initialShowAll: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [items, setItems] = useState<PaymentQueueItem[]>(initialItems);
  const [showAll, setShowAll] = useState(initialShowAll);
  const [openTx, setOpenTx] = useState<PaymentQueueItem | null>(null);

  function toggleShowAll(next: boolean) {
    const params = new URLSearchParams(sp);
    if (next) params.set("showAll", "true"); else params.delete("showAll");
    router.replace(`/banking/payments?${params.toString()}`);
    setShowAll(next);
    void listPaymentsQueue(next).then(setItems);
  }

  async function onDismiss(t: PaymentQueueItem) {
    await dismissPayment(t.id);
    setItems((arr) => arr.filter((x) => x.id !== t.id));
  }

  function onApplied(_txId: string) {
    setItems((arr) => arr.filter((x) => x.id !== _txId));
    setOpenTx(null);
  }

  return (
    <div className="space-y-3 p-6">
      <div className="flex items-center gap-2">
        <Link href="/transactions" className="text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-lg font-semibold">Payments to review ({items.length} pending)</h1>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(e) => toggleShowAll(e.target.checked)} />
          Show all positive
        </label>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Nothing to review. Bank transactions categorised as Income — Customer payments will appear here.
          {!showAll && (
            <div className="mt-2">
              <Button size="sm" variant="ghost" onClick={() => toggleShowAll(true)}>Show all positive instead</Button>
            </div>
          )}
        </div>
      ) : (
        items.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <span className="font-mono">{t.date}</span>
            <span className="font-mono font-semibold">{fmtAmount(t.amount)}</span>
            <span className="flex-1 truncate">{t.description}</span>
            <span className="text-xs text-slate-500">{t.accountName}</span>
            <span className="text-xs text-slate-700">
              {t.vendorName ?? "—"}{t.vendorCustomerName ? ` (→ ${t.vendorCustomerName})` : ""}
            </span>
            <Button size="sm" onClick={() => setOpenTx(t)}>Apply</Button>
            <Button size="sm" variant="ghost" onClick={() => onDismiss(t)}>Not a customer payment</Button>
          </div>
        ))
      )}

      {openTx && (
        <ApplyPaymentModal
          context="queue"
          transaction={openTx}
          onClose={() => setOpenTx(null)}
          onApplied={() => onApplied(openTx.id)}
        />
      )}
    </div>
  );
}
