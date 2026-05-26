"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Scissors } from "lucide-react";
import { setTransactionCategory } from "@/lib/banking-rules";
import { getTransaction } from "@/lib/banking";
import { applyAiSuggestion } from "@/lib/ai";
import type { AiDraftView, CategorisationProvenance, Category, Transaction, Vendor } from "@/lib/types";
import { AiSuggestionBanner } from "./ai-suggestion-banner";
import { TransactionHistoryDrawer } from "./transaction-history-drawer";

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
  aiReviewMode = false,
  onAiReviewResolved,
}: {
  transaction: Transaction & {
    splits?: Array<{ id: string; categoryId: string; amount: string | number; notes?: string | null }>;
    account?: { id: string; name: string };
  };
  categories: Category[];
  vendors: Vendor[];
  onClose: () => void;
  onManageSplits: () => void;
  // When true the modal is launched from the AI Review queue: the AiSuggestionBanner
  // is hidden (the parent already shows the suggestion) and Save resolves the
  // pending AI draft via /ai/apply so the row disappears from the queue.
  aiReviewMode?: boolean;
  onAiReviewResolved?: () => void;
}) {
  const router = useRouter();
  const hasSplits = !!transaction.splits && transaction.splits.length > 0;

  // Two-stage category selection: parent + subcategory.
  // Initial derivation from the transaction's current categoryId:
  //   - if the current category has a parentId, parent = that parent, sub = current
  //   - if the current category has no parentId (top-level leaf), parent = current, sub = ''
  //   - if no category: both empty
  const initialCategory = transaction.categoryId
    ? categories.find((c) => c.id === transaction.categoryId)
    : null;
  const initialParentId = initialCategory
    ? (initialCategory.parentId ?? initialCategory.id)
    : "";
  const initialSubId = initialCategory && initialCategory.parentId
    ? initialCategory.id
    : "";
  const [parentCategoryId, setParentCategoryId] = useState<string>(initialParentId);
  const [subcategoryId, setSubcategoryId] = useState<string>(initialSubId);

  // Build a map of parent id → its active children. Used to (a) decide whether the
  // Subcategory dropdown is meaningful, and (b) populate its options.
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      if (c.parentId) {
        const arr = map.get(c.parentId) ?? [];
        arr.push(c);
        map.set(c.parentId, arr);
      }
    }
    return map;
  }, [categories]);

  const topLevelCategories = useMemo(
    () => categories.filter((c) => c.parentId === null && c.isActive),
    [categories],
  );
  const childrenOfSelectedParent = useMemo(
    () => parentCategoryId ? (childrenByParent.get(parentCategoryId) ?? []).filter((c) => c.isActive) : [],
    [parentCategoryId, childrenByParent],
  );
  // True when the selected top-level has children (i.e. is a group); the user
  // MUST then pick a subcategory because transactions can't attach to a parent.
  const parentRequiresSub = childrenOfSelectedParent.length > 0;

  // The categoryId that will be persisted: subcategory if the parent has children,
  // otherwise the parent itself (which is a standalone leaf in that case).
  const categoryId = parentRequiresSub ? subcategoryId : parentCategoryId;
  const [vendorId, setVendorId] = useState<string>(transaction.vendorId ?? "");
  const [notes, setNotes] = useState<string>(transaction.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [activeDraft, setActiveDraft] = useState<AiDraftView | null>(null);
  const [aiEditMode, setAiEditMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [provenance, setProvenance] = useState<CategorisationProvenance>(
    transaction.categorisationProvenance ?? null
  );

  useEffect(() => {
    // Fetch fresh to populate categorisationProvenance which the list endpoint doesn't include.
    if (!transaction.id) return;
    let cancelled = false;
    getTransaction(transaction.id)
      .then((fresh) => {
        if (cancelled) return;
        if (fresh.categorisationProvenance !== undefined) {
          setProvenance(fresh.categorisationProvenance ?? null);
        }
      })
      .catch(() => { /* leave provenance as is */ });
    return () => { cancelled = true; };
  }, [transaction.id]);

  useEffect(() => {
    if (!activeDraft || aiEditMode) return;
    if (categoryId !== (activeDraft.categoryId ?? '') || vendorId !== (activeDraft.vendorId ?? '')) {
      setAiEditMode(true);
    }
  }, [categoryId, vendorId, activeDraft, aiEditMode]);

  async function onSave() {
    setSaving(true);
    try {
      if (aiReviewMode) {
        // From the AI Review queue we always resolve the pending draft via /ai/apply.
        // The server resolves accept-vs-edit based on whether chosen values match the
        // AI's pick, so an unchanged save accepts and an edited save edits — both
        // remove the row from the review queue.
        await applyAiSuggestion(transaction.id, {
          action: 'edit',
          chosenCategoryId: categoryId,
          chosenVendorId: vendorId || null,
        });
        onAiReviewResolved?.();
      } else if (aiEditMode && activeDraft) {
        // Server-side resolves accept-vs-edit based on whether chosen values
        // match the AI's pick (decided server-side per spec).
        await applyAiSuggestion(transaction.id, {
          action: 'edit',
          chosenCategoryId: categoryId,
          chosenVendorId: vendorId || null,
        });
      } else {
        await setTransactionCategory(transaction.id, {
          categoryId: categoryId || undefined,
          vendorId: vendorId || undefined,
          notes,
        });
      }
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Edit transaction</DialogTitle>
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-800"
            onClick={() => setHistoryOpen(true)}
          >
            <Clock className="inline h-3 w-3" /> History
          </button>
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

          {!aiReviewMode && (
            <AiSuggestionBanner
              transactionId={transaction.id}
              auto={!transaction.categoryId}
              onAccepted={() => { router.refresh(); onClose(); }}
              onRejected={() => { setActiveDraft(null); setAiEditMode(false); }}
              onEditMode={(draft) => {
                setActiveDraft(draft);
                setAiEditMode(true);
                if (draft.categoryId) {
                  const cat = categories.find((c) => c.id === draft.categoryId);
                  if (cat) {
                    setParentCategoryId(cat.parentId ?? cat.id);
                    setSubcategoryId(cat.parentId ? cat.id : "");
                  }
                }
                if (draft.vendorId)   setVendorId(draft.vendorId);
              }}
              onDraftLoaded={setActiveDraft}
            />
          )}

          {/* Editable block */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Category">
              <Select
                value={parentCategoryId || "__none__"}
                onValueChange={(v) => {
                  const next = v === "__none__" ? "" : v;
                  setParentCategoryId(next);
                  // Reset subcategory whenever the parent changes — the previous
                  // subcategoryId would point at a child of the old parent.
                  setSubcategoryId("");
                }}
              >
                <SelectTrigger><SelectValue placeholder="— uncategorised —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— uncategorised —</SelectItem>
                  {topLevelCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {provenance && (
                <div className="mt-1 text-xs italic text-slate-500">
                  {provenance.source === 'AI_APPLIED'
                    ? `Categorised by AI${provenance.providerName ? ` (${provenance.providerName})` : ''} on ${new Date(provenance.at).toLocaleString()}`
                    : provenance.source === 'RULE'
                    ? `Categorised by rule${provenance.ruleName ? ` "${provenance.ruleName}"` : ''} on ${new Date(provenance.at).toLocaleString()}`
                    : `Categorised by user on ${new Date(provenance.at).toLocaleString()}`}
                </div>
              )}
            </Field>
            <Field label="Subcategory">
              {parentRequiresSub ? (
                <Select
                  value={subcategoryId || "__none__"}
                  onValueChange={(v) => setSubcategoryId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger><SelectValue placeholder="— pick one —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— pick one —</SelectItem>
                    {childrenOfSelectedParent.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value="__none__" disabled>
                  <SelectTrigger>
                    <SelectValue placeholder={parentCategoryId ? "— no subcategories —" : "— pick a category first —"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{parentCategoryId ? "no subcategories" : "pick a category first"}</SelectItem>
                  </SelectContent>
                </Select>
              )}
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
          <Button
            type="button"
            onClick={onSave}
            disabled={saving || (parentRequiresSub && !subcategoryId)}
            title={parentRequiresSub && !subcategoryId ? "Pick a subcategory — this category is a group, not a leaf" : undefined}
          >
            {saving ? "Saving…" : aiReviewMode ? "Save and Accept" : "Save"}
          </Button>
        </DialogFooter>
        <TransactionHistoryDrawer
          transactionId={transaction.id}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          categories={categories}
          vendors={vendors}
        />
      </DialogContent>
    </Dialog>
  );
}
