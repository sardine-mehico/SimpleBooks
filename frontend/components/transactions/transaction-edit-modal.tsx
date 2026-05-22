"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Scissors } from "lucide-react";
import { setTransactionCategory } from "@/lib/banking-rules";
import type { Category, Transaction, Vendor } from "@/lib/types";

function fmtAmount(amount: string | number): string {
  const n = Number(amount);
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtBalance(amount: string | number | null | undefined): string {
  if (amount == null) return "—";
  return `$${Number(amount).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TransactionEditModal({
  transaction,
  categories,
  vendors,
  onClose,
  onManageSplits,
}: {
  transaction: Transaction & {
    splits?: Array<{ id: string; categoryId: string; amount: string | number; notes?: string | null }>;
    account?: { id: string; name: string };
  };
  categories: Category[];
  vendors: Vendor[];
  onClose: () => void;
  onManageSplits: () => void;
}) {
  const router = useRouter();
  const hasSplits = !!transaction.splits && transaction.splits.length > 0;

  const [categoryId, setCategoryId] = useState<string>(transaction.categoryId ?? "");
  const [vendorId, setVendorId] = useState<string>(transaction.vendorId ?? "");
  const [notes, setNotes] = useState<string>(transaction.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    try {
      await setTransactionCategory(transaction.id, {
        categoryId: categoryId || undefined,
        vendorId: vendorId || undefined,
        notes,
      });
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {hasSplits && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                This transaction has {transaction.splits!.length} splits. Setting a single Category here will reset the
                splits. To keep the breakdown, use <strong>Manage splits</strong> instead.
              </div>
            </div>
          )}

          {/* Read-only block */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <div>
              <div className="text-slate-500">Date</div>
              <div className="font-mono text-slate-800">{transaction.date.slice(0, 10)}</div>
            </div>
            <div>
              <div className="text-slate-500">Amount</div>
              <div className="font-mono text-slate-800">{fmtAmount(transaction.amount)}</div>
            </div>
            <div className="col-span-2">
              <div className="text-slate-500">Description</div>
              <div className="text-slate-800">{transaction.description}</div>
            </div>
            <div>
              <div className="text-slate-500">Balance</div>
              <div className="font-mono text-slate-800">{fmtBalance(transaction.runningBalance)}</div>
            </div>
            <div>
              <div className="text-slate-500">Account</div>
              <div className="text-slate-800">{transaction.account?.name ?? "—"}</div>
            </div>
          </div>

          {/* Editable block */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Category">
              <Select value={categoryId || "__none__"} onValueChange={(v) => setCategoryId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="— uncategorised —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— uncategorised —</SelectItem>
                  {categories.filter((c) => c.isActive).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Vendor">
              <Select value={vendorId || "__none__"} onValueChange={(v) => setVendorId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {vendors.filter((v) => v.isActive).map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />
          </Field>

          <div>
            <Button type="button" variant="outline" size="sm" onClick={onManageSplits}>
              <Scissors className="h-3.5 w-3.5" /> Manage splits
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
