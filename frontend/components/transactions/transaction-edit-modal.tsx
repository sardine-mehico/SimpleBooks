"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Pencil, Scissors } from "lucide-react";
import { createCategory, setTransactionCategory, setTransactionTags } from "@/lib/banking-rules";
import { createTransaction, getTransaction, updateTransactionFields } from "@/lib/banking";
import { applyAiSuggestion } from "@/lib/ai";
import type { AiDraftView, CategorisationProvenance, Category, Tag, Transaction } from "@/lib/types";
import { AiSuggestionBanner } from "./ai-suggestion-banner";
import { TransactionHistoryDrawer } from "./transaction-history-drawer";
import { TagMultiSelect } from "@/components/tags/tag-multi-select";

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
  accounts,
  categories,
  tags,
  onClose,
  onManageSplits,
  aiReviewMode = false,
  onAiReviewResolved,
  onCreated,
}: {
  // Undefined ⇒ create mode (Add Transaction). Otherwise edit mode.
  transaction?: Transaction & {
    splits?: Array<{ id: string; categoryId: string; amount: string | number; notes?: string | null }>;
    account?: { id: string; name: string };
  };
  // Required in create mode (so the Account dropdown has options); optional in edit
  // mode but needed when the user clicks the unlock icon to change accounts.
  accounts?: Array<{ id: string; name: string; isActive?: boolean }>;
  categories: Category[];
  tags: Tag[];
  onClose: () => void;
  onManageSplits?: () => void;
  // When true the modal is launched from the AI Review queue: the AiSuggestionBanner
  // is hidden (the parent already shows the suggestion) and Save resolves the
  // pending AI draft via /ai/apply so the row disappears from the queue.
  aiReviewMode?: boolean;
  onAiReviewResolved?: () => void;
  // Fires after a successful create — typically used to refresh the list.
  onCreated?: () => void;
}) {
  const router = useRouter();
  const isCreate = !transaction;
  const hasSplits = !isCreate && !!transaction!.splits && transaction!.splits.length > 0;

  // Two-stage category selection: parent + subcategory.
  // Initial derivation from the transaction's current categoryId:
  //   - if the current category has a parentId, parent = that parent, sub = current
  //   - if the current category has no parentId (top-level leaf), parent = current, sub = ''
  //   - if no category (create mode or uncategorised): both empty
  const initialCategory = transaction?.categoryId
    ? categories.find((c) => c.id === transaction!.categoryId)
    : null;
  const initialParentId = initialCategory
    ? (initialCategory.parentId ?? initialCategory.id)
    : "";
  const initialSubId = initialCategory && initialCategory.parentId
    ? initialCategory.id
    : "";
  const [parentCategoryId, setParentCategoryId] = useState<string>(initialParentId);
  const [subcategoryId, setSubcategoryId] = useState<string>(initialSubId);

  // Core fields. Locked behind `unlocked` in edit mode; always editable in create mode.
  const [unlocked, setUnlocked] = useState<boolean>(isCreate);
  const todayLocal = new Date().toISOString().slice(0, 10);
  const [txDate, setTxDate] = useState<string>(transaction?.date.slice(0, 10) ?? todayLocal);
  const [txAmount, setTxAmount] = useState<string>(transaction ? String(transaction.amount) : "");
  const [txDescription, setTxDescription] = useState<string>(transaction?.description ?? "");
  const [accountId, setAccountId] = useState<string>(transaction?.accountId ?? (accounts?.[0]?.id ?? ""));

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

  // Special case: when the picked parent is a TRANSFER-kind category, the
  // "subcategory" position renders accounts instead of regular child categories.
  // The user picks the destination/source account; on save we find-or-create a
  // TRANSFER subcategory under that parent whose name matches the picked account.
  const selectedParentCategory = parentCategoryId
    ? categories.find((c) => c.id === parentCategoryId)
    : null;
  const isTransferMode = selectedParentCategory?.kind === 'TRANSFER';

  // Initialise transferAccountId by matching the current subcategory's name to an account.
  // (When editing an existing transfer-categorised row, the subcategory will be an
  // auto-created child named after the other account.)
  const initialTransferAccountId = (() => {
    if (!initialCategory?.parentId) return '';
    const parent = categories.find((c) => c.id === initialCategory.parentId);
    if (parent?.kind !== 'TRANSFER') return '';
    const target = (accounts ?? []).find(
      (a) => a.name.trim().toLowerCase() === initialCategory.name.trim().toLowerCase(),
    );
    return target?.id ?? '';
  })();
  const [transferAccountId, setTransferAccountId] = useState<string>(initialTransferAccountId);

  // Accounts available as transfer targets — exclude the transaction's own account.
  const transferDestinationAccounts = useMemo(() => {
    if (!accounts) return [];
    const ownAccountId = transaction?.accountId ?? accountId;
    return accounts.filter((a) => a.id !== ownAccountId && (a.isActive ?? true));
  }, [accounts, transaction?.accountId, accountId]);

  // True when the user must pick a child (either a real subcategory under a group
  // parent, or a destination account under a TRANSFER parent).
  const parentRequiresSub = childrenOfSelectedParent.length > 0 || isTransferMode;

  // The categoryId used for render-time logic (disabled checks, AI-edit diff). In
  // transfer mode, this stays empty here — the actual persisted id is resolved
  // inside onSave via find-or-create against the chosen destination account.
  const categoryId = isTransferMode
    ? ''
    : (parentRequiresSub ? subcategoryId : parentCategoryId);
  const initialTagIds = transaction?.transactionTags?.map((tt) => tt.tag.id) ?? [];
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTagIds);
  const [notes, setNotes] = useState<string>(transaction?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [activeDraft, setActiveDraft] = useState<AiDraftView | null>(null);
  const [aiEditMode, setAiEditMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [provenance, setProvenance] = useState<CategorisationProvenance>(
    transaction?.categorisationProvenance ?? null
  );

  useEffect(() => {
    // Fetch fresh to populate categorisationProvenance which the list endpoint doesn't include.
    if (!transaction?.id) return;
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
  }, [transaction?.id]);

  useEffect(() => {
    if (!activeDraft || aiEditMode) return;
    if (categoryId !== (activeDraft.categoryId ?? '')) {
      setAiEditMode(true);
    }
  }, [categoryId, activeDraft, aiEditMode]);

  async function onSave() {
    setSaving(true);
    try {
      // Resolve the effective categoryId. In transfer mode, the visual "Other account"
      // picker yields an accountId — we find-or-create a TRANSFER-kind subcategory
      // named after that account under the chosen transfer parent.
      let effectiveCategoryId = categoryId;
      if (isTransferMode && transferAccountId) {
        const acct = accounts?.find((a) => a.id === transferAccountId);
        if (!acct) throw new Error('Selected account not found');
        const target = acct.name.trim();
        const existing = childrenOfSelectedParent.find(
          (c) => c.name.trim().toLowerCase() === target.toLowerCase(),
        );
        if (existing) {
          effectiveCategoryId = existing.id;
        } else {
          const created = await createCategory({
            name: target,
            kind: 'TRANSFER',
            parentId: parentCategoryId,
          });
          effectiveCategoryId = created.id;
        }
      }

      if (isCreate) {
        // Manual create — single POST with everything.
        const amountNum = Number(txAmount);
        if (!Number.isFinite(amountNum)) throw new Error('Amount must be a number');
        if (!accountId) throw new Error('Pick an account');
        if (!txDate) throw new Error('Date is required');
        if (!txDescription.trim()) throw new Error('Description is required');
        await createTransaction({
          accountId,
          date: txDate,
          amount: amountNum,
          description: txDescription.trim(),
          categoryId: effectiveCategoryId || undefined,
          tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
          notes: notes || undefined,
        });
        onCreated?.();
        router.refresh();
        onClose();
        return;
      }

      const txId = transaction!.id;
      // If core fields were unlocked AND changed, save them first via PATCH /:id.
      if (unlocked) {
        const coreChanges: Record<string, string | number> = {};
        if (accountId && accountId !== transaction!.accountId) coreChanges.accountId = accountId;
        if (txDate && txDate !== transaction!.date.slice(0, 10)) coreChanges.date = txDate;
        const amountNum = Number(txAmount);
        if (Number.isFinite(amountNum) && String(amountNum) !== String(Number(transaction!.amount))) {
          coreChanges.amount = amountNum;
        }
        if (txDescription !== transaction!.description) coreChanges.description = txDescription;
        if (Object.keys(coreChanges).length > 0) {
          await updateTransactionFields(txId, coreChanges);
        }
      }

      if (aiReviewMode) {
        // From the AI Review queue we always resolve the pending draft via /ai/apply.
        await applyAiSuggestion(txId, {
          action: 'edit',
          chosenCategoryId: effectiveCategoryId,
        });
        onAiReviewResolved?.();
      } else if (aiEditMode && activeDraft) {
        await applyAiSuggestion(txId, {
          action: 'edit',
          chosenCategoryId: effectiveCategoryId,
        });
      } else {
        await setTransactionCategory(txId, {
          categoryId: effectiveCategoryId || undefined,
          notes,
        });
      }
      // Sync tag selection — always runs in edit mode regardless of which save path.
      const originalTagIds = (transaction!.transactionTags ?? []).map((tt) => tt.tag.id).sort();
      const nextTagIds = [...selectedTagIds].sort();
      if (originalTagIds.join(',') !== nextTagIds.join(',')) {
        await setTransactionTags(txId, selectedTagIds);
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
          <DialogTitle>{isCreate ? "Add transaction" : "Edit transaction"}</DialogTitle>
          {!isCreate && (
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-800"
              onClick={() => setHistoryOpen(true)}
            >
              <Clock className="inline h-3 w-3" /> History
            </button>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {!isCreate && hasSplits && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                This transaction has {transaction!.splits!.length} splits. Setting a single Category here will reset the
                splits. To keep the breakdown, use <strong>Manage splits</strong> instead.
              </div>
            </div>
          )}

          {/* Core fields — editable when create OR unlocked, otherwise read-only with pencil to unlock. */}
          {(isCreate || unlocked) ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-slate-500">
                <span>{isCreate ? "Transaction details" : "Edit details"}</span>
                {!isCreate && (
                  <button
                    type="button"
                    onClick={() => setUnlocked(false)}
                    className="text-xs normal-case tracking-normal text-slate-500 hover:text-slate-800"
                  >
                    cancel
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Date">
                  <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
                </Field>
                <Field label="Amount (signed)">
                  <Input
                    type="number"
                    step="0.01"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="e.g. -12.50 or 514.08"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Description">
                    <Input
                      value={txDescription}
                      onChange={(e) => setTxDescription(e.target.value)}
                      maxLength={500}
                    />
                  </Field>
                </div>
                <Field label="Account">
                  {accounts && accounts.length > 0 ? (
                    <Select value={accountId || "__none__"} onValueChange={(v) => setAccountId(v === "__none__" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="— pick one —" /></SelectTrigger>
                      <SelectContent>
                        {accounts.filter((a) => a.isActive !== false).map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-xs italic text-slate-400 py-1.5">
                      {transaction?.account?.name ?? "—"} (no accounts list provided)
                    </div>
                  )}
                </Field>
              </div>
            </div>
          ) : (
            <div className="relative rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <button
                type="button"
                onClick={() => setUnlocked(true)}
                aria-label="Edit transaction details"
                className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                title="Edit date / amount / description / account"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <div className="grid grid-cols-2 gap-3 pr-6">
                <div>
                  <div className="text-slate-500">Date</div>
                  <div className="font-mono text-slate-800">{transaction!.date.slice(0, 10)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Amount</div>
                  <div className="font-mono text-slate-800">{fmtAmount(transaction!.amount)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-slate-500">Description</div>
                  <div className="text-slate-800">{transaction!.description}</div>
                </div>
                <div>
                  <div className="text-slate-500">Balance</div>
                  <div className="font-mono text-slate-800">{fmtBalance(transaction!.runningBalance)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Account</div>
                  <div className="text-slate-800">{transaction!.account?.name ?? "—"}</div>
                </div>
              </div>
            </div>
          )}

          {!isCreate && !aiReviewMode && (
            <AiSuggestionBanner
              transactionId={transaction!.id}
              auto={!transaction!.categoryId}
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
                  // Reset both child-selectors whenever the parent changes — the
                  // previous values pertain to the old parent.
                  setSubcategoryId("");
                  setTransferAccountId("");
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
            <Field label={isTransferMode ? "Other account" : "Subcategory"}>
              {isTransferMode ? (
                transferDestinationAccounts.length > 0 ? (
                  <Select
                    value={transferAccountId || "__none__"}
                    onValueChange={(v) => setTransferAccountId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="— pick the other account —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— pick the other account —</SelectItem>
                      {transferDestinationAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value="__none__" disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="— no other accounts available —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">no other accounts available</SelectItem>
                    </SelectContent>
                  </Select>
                )
              ) : parentRequiresSub ? (
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
            <Field label="Tags">
              <TagMultiSelect tags={tags} selectedIds={selectedTagIds} onChange={setSelectedTagIds} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />
          </Field>

          {!isCreate && onManageSplits && (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={onManageSplits}>
                <Scissors className="h-3.5 w-3.5" /> Manage splits
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={
              saving ||
              (parentRequiresSub && (isTransferMode ? !transferAccountId : !subcategoryId))
            }
            title={
              parentRequiresSub && (isTransferMode ? !transferAccountId : !subcategoryId)
                ? (isTransferMode
                    ? "Pick the other account for this transfer"
                    : "Pick a subcategory — this category is a group, not a leaf")
                : undefined
            }
          >
            {saving ? "Saving…" : aiReviewMode ? "Save and Accept" : "Save"}
          </Button>
        </DialogFooter>
        {!isCreate && (
          <TransactionHistoryDrawer
            transactionId={transaction!.id}
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            categories={categories}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
