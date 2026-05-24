"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { deleteAllocation } from "@/lib/payments";
import type { Allocation, Invoice } from "@/lib/types";
import { UnapplyConfirmDialog } from "./unapply-confirm-dialog";

function previewStatus(
  invoice: Pick<Invoice, "status" | "amountOutstanding" | "totalAmount">,
  removeAmount: string,
): "DRAFT" | "SENT" | "VIEWED" | "PARTIAL_PAID" {
  const newPaid = Number(invoice.totalAmount) - Number(invoice.amountOutstanding) - Number(removeAmount);
  if (newPaid <= 0) {
    return "SENT";
  }
  return "PARTIAL_PAID";
}

export function AllocationsPanel({
  invoice,
  allocations,
  onChanged,
  onReceivePayment,
}: {
  invoice: Invoice & { lineItems?: unknown[] };
  allocations: Array<Allocation & { transactionDescription?: string; transactionDate?: string }>;
  onChanged: () => void;
  onReceivePayment: () => void;
}) {
  const [pending, setPending] = useState<{ id: string; amount: string } | null>(null);

  if (allocations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
        No payments allocated yet.
        <Button size="sm" className="ml-2" onClick={onReceivePayment}>Receive payment</Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-sm font-medium">Allocations</div>
      <ul className="divide-y divide-slate-100">
        {allocations.map((a) => (
          <li key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="font-mono text-xs">{a.transactionDate?.slice(0, 10) ?? a.createdAt.slice(0, 10)}</span>
            <Link
              href={`/transactions?txId=${a.transactionId}`}
              className="flex-1 truncate text-slate-700 hover:underline"
            >
              {a.transactionDescription ?? a.transactionId}
            </Link>
            <span className="font-mono">${Number(a.amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
            <button
              className="text-slate-400 hover:text-rose-700"
              onClick={() => setPending({ id: a.id, amount: a.amount })}
              aria-label="Un-apply"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      {pending && (
        <UnapplyConfirmDialog
          amount={pending.amount}
          resultingStatus={previewStatus(invoice, pending.amount)}
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await deleteAllocation(pending.id);
            setPending(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
