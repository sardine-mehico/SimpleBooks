"use client";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function UnapplyConfirmDialog({
  amount,
  resultingStatus,
  onCancel,
  onConfirm,
}: {
  amount: string;
  resultingStatus: "DRAFT" | "SENT" | "VIEWED" | "PARTIAL_PAID";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Un-apply payment</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Un-apply ${Number(amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })} from this invoice?
          The invoice will revert to <strong>{resultingStatus}</strong>.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Un-apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
