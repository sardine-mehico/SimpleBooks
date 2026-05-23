"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { bulkSendInvoices, type BulkSendResult } from "@/lib/invoices";

type Stage = "idle" | "sending" | "done";

export function BulkSendInvoicesDialog({
  open,
  selectedIds,
  onClose,
}: {
  open: boolean;
  selectedIds: Set<string>;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<BulkSendResult | null>(null);
  const [expandedErrors, setExpandedErrors] = useState(false);

  const count = selectedIds.size;

  async function send() {
    setStage("sending");
    try {
      const r = await bulkSendInvoices([...selectedIds]);
      setResult(r);
      setStage("done");
    } catch (e: any) {
      setResult({
        sent: [],
        failed: [{ id: "", invoiceNumber: 0, error: e?.message ?? "Unknown error" }],
      });
      setStage("done");
    }
  }

  function handleClose() {
    setStage("idle");
    setResult(null);
    setExpandedErrors(false);
    onClose();
  }

  function handleOpenChange(next: boolean) {
    if (!next && stage !== "sending") handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send invoices</DialogTitle>
          {stage === "idle" && (
            <DialogDescription>
              {count} {count === 1 ? "invoice" : "invoices"} will be sent using the default email template for each invoice.
            </DialogDescription>
          )}
        </DialogHeader>

        {stage === "idle" && (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" onClick={send}>
              Send {count} {count === 1 ? "invoice" : "invoices"}
            </Button>
          </DialogFooter>
        )}

        {stage === "sending" && (
          <div className="flex items-center gap-3 py-4 text-sm text-slate-600" aria-live="polite">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"
              aria-hidden
            />
            Sending&hellip; please wait.
          </div>
        )}

        {stage === "done" && result && (
          <div className="space-y-3 py-1">
            {result.sent.length > 0 && (
              <p className="text-sm text-emerald-700" role="status">
                Sent: {result.sent.length} {result.sent.length === 1 ? "invoice" : "invoices"}
              </p>
            )}
            {result.failed.length > 0 && (
              <div>
                <p className="text-sm font-medium text-rose-700">
                  Failed: {result.failed.length}
                </p>
                <button
                  type="button"
                  className="mt-1 text-xs text-slate-500 underline underline-offset-2"
                  onClick={() => setExpandedErrors((v) => !v)}
                >
                  {expandedErrors ? "Hide details" : "Show details"}
                </button>
                {expandedErrors && (
                  <ul className="mt-2 space-y-1 rounded border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700">
                    {result.failed.map((f, i) => (
                      <li key={f.id || i}>
                        {f.invoiceNumber > 0 ? `INV-${f.invoiceNumber}` : f.id || "Unknown"} —{" "}
                        {f.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
