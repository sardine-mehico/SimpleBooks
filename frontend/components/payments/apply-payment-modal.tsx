"use client";
import type { PaymentQueueItem } from "@/lib/types";

export function ApplyPaymentModal(props: {
  context: "queue" | "invoice" | "transaction";
  transaction?: PaymentQueueItem | null;
  transactionId?: string;
  invoiceId?: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-lg bg-white p-4 text-sm">
        <div>Apply payment — stub (Task 18 implements the real modal)</div>
        <button className="mt-3 rounded border px-2 py-1" onClick={props.onClose}>Close</button>
      </div>
    </div>
  );
}
