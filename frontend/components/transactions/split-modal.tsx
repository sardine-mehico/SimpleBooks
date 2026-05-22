"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";
import { setTransactionSplits } from "@/lib/banking-rules";
import type { Category, Transaction } from "@/lib/types";

type SplitRow = { categoryId: string; amount: string; notes: string };

export function SplitModal({
  transaction, categories, onClose,
}: {
  transaction: Transaction & { splits?: Array<{ id: string; categoryId: string; amount: string | number; notes?: string | null }> };
  categories: Category[];
  onClose: () => void;
}) {
  const router = useRouter();
  const initialRows: SplitRow[] = transaction.splits && transaction.splits.length > 0
    ? transaction.splits.map((s) => ({ categoryId: s.categoryId, amount: String(s.amount), notes: s.notes ?? "" }))
    : [{ categoryId: transaction.categoryId ?? categories[0]?.id ?? "", amount: String(transaction.amount), notes: "" }];
  const [rows, setRows] = useState<SplitRow[]>(initialRows);
  const [saving, setSaving] = useState(false);

  const txAmount = Number(transaction.amount);
  const allocated = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const remaining = txAmount - allocated;
  const balanced = Math.abs(remaining) < 0.005;

  function update(i: number, patch: Partial<SplitRow>) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    setRows((cur) => [...cur, { categoryId: categories[0]?.id ?? "", amount: remaining.toFixed(2), notes: "" }]);
  }
  function removeAt(i: number) {
    setRows((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function onSave() {
    if (!balanced) return;
    setSaving(true);
    try {
      await setTransactionSplits(transaction.id, rows.map((r) => ({
        categoryId: r.categoryId,
        amount: Number(r.amount),
        notes: r.notes || undefined,
      })));
      router.refresh();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Split transaction</DialogTitle>
        </DialogHeader>
        <div className="mb-3 text-xs text-slate-500">
          <div>Date: {transaction.date.slice(0, 10)} · Amount: ${txAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</div>
          <div className="truncate">{transaction.description}</div>
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[2fr_120px_2fr_40px] items-center gap-2">
              <Select value={r.categoryId} onValueChange={(v) => update(i, { categoryId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" step="0.01" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} className="text-right font-mono tabular-nums" />
              <Input value={r.notes} onChange={(e) => update(i, { notes: e.target.value })} placeholder="notes (optional)" />
              <Button type="button" variant="ghost" size="sm" onClick={() => removeAt(i)} aria-label="Remove split"><X className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="h-3.5 w-3.5" /> Add split row
          </Button>
          <div className={`text-sm font-mono tabular-nums ${balanced ? "text-emerald-700" : "text-amber-700"}`}>
            Allocated ${allocated.toFixed(2)} · Remaining ${remaining.toFixed(2)} {balanced && "✓"}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={onSave} disabled={!balanced || saving}>{saving ? "Saving…" : "Save splits"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
