"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, ChevronUp, ChevronDown, ChevronsUpDown, Sparkles, Trash2, X, RefreshCw, Check, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/data/pagination";
import { cn } from "@/lib/utils";
import { TransactionAmountCell } from "./transaction-amount-cell";
import { TransactionEditModal } from "./transaction-edit-modal";
import { listTransactions, bulkDeleteTransactions } from "@/lib/banking";
import { bulkSuggest } from "@/lib/ai";
import { CATEGORY_KINDS } from "@/lib/types";
import type { Account, Category, CategoryKind, Customer, PaymentQueueItem, Tag, Transaction } from "@/lib/types";
import { RecategoriseDialog } from "./recategorise-dialog";
import { BulkAiCategoriseDialog } from "./bulk-ai-categorise-dialog";
import { TransactionRowMenu } from "./transaction-row-menu";
import { ApplyPaymentModal } from "@/components/payments/apply-payment-modal";
import { TagMultiSelect } from "@/components/tags/tag-multi-select";

type SortKey = "date" | "amount" | "description";

const VALID_SORT_KEYS: SortKey[] = ["date", "amount", "description"];

// Category select value encoding:
//   '__any__'              => Any category (no filter)
//   '__uncategorised'      => categoryId IS NULL
//   '__pending_ai_review'  => has unresolved AI_DRAFT
//   '__kind:INCOME'        => category.kind = INCOME
//   '__kind:EXPENSE'       => category.kind = EXPENSE
//   '__kind:TRANSFER'      => category.kind = TRANSFER
//   '<uuid>'               => exact categoryId match
//
// Tag filter URL params:
//   ?tagIds=<uuid>,<uuid>   => matches transactions with ANY of these tags
//   ?tagNone=true           => matches transactions with NO tags

function encodeCategoryUrlParams(val: string): Record<string, string | null> {
  if (!val || val === "__any__") {
    return { categoryId: null, categoryUncategorised: null, categoryKind: null, pendingAiReview: null };
  }
  if (val === "__uncategorised") {
    return { categoryId: null, categoryUncategorised: "true", categoryKind: null, pendingAiReview: null };
  }
  if (val === "__pending_ai_review") {
    return { categoryId: null, categoryUncategorised: null, categoryKind: null, pendingAiReview: "true" };
  }
  if (val.startsWith("__kind:")) {
    return { categoryId: null, categoryUncategorised: null, categoryKind: val.slice(7), pendingAiReview: null };
  }
  return { categoryId: val, categoryUncategorised: null, categoryKind: null, pendingAiReview: null };
}

function decodeCategoryUrlParams(
  categoryId: string,
  categoryUncategorised: string,
  categoryKind: string,
  pendingAiReview: string,
): string {
  if (categoryId) return categoryId;
  if (categoryUncategorised === "true") return "__uncategorised";
  if (pendingAiReview === "true") return "__pending_ai_review";
  if (categoryKind) return `__kind:${categoryKind}`;
  return "__any__";
}

function encodeTagUrlParams(tagIds: string[], tagNone: boolean): Record<string, string | null> {
  if (tagNone) return { tagIds: null, tagNone: "true" };
  if (tagIds.length === 0) return { tagIds: null, tagNone: null };
  return { tagIds: tagIds.join(","), tagNone: null };
}

function decodeTagIdsFromUrl(tagIds: string): string[] {
  if (!tagIds) return [];
  return tagIds.split(",").map((s) => s.trim()).filter(Boolean);
}

export function TransactionsTable({
  mode,
  fixedAccountId,
  accounts,
  categories,
  tags,
  customers,
  searchParams,
}: {
  mode: "account" | "global";
  fixedAccountId?: string;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  customers: Customer[];
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearch = useSearchParams();

  // URL-driven state — parse on every render.
  // Guard against legacy URLs (e.g. ?sortBy=runningBalance from before the
  // server-computed balance refactor) so stale links fall back to the default.
  const rawSortBy = searchParams.sortBy as string | undefined;
  const sortBy: SortKey = VALID_SORT_KEYS.includes(rawSortBy as SortKey)
    ? (rawSortBy as SortKey)
    : "date";
  const sortDir = (searchParams.sortDir as "asc" | "desc") || "desc";
  const page = Number(searchParams.page ?? 1);
  const dateFrom = (searchParams.dateFrom as string) || "";
  const dateTo = (searchParams.dateTo as string) || "";
  const selectedAccountIds: string[] = mode === "account"
    ? [fixedAccountId!]
    : ((searchParams.accountIds as string)?.split(",").filter(Boolean) ?? []);
  // Refresh token — bumped by the import dialog (and other callers) to force a re-fetch
  // when the URL otherwise doesn't change. Read as a string so it's stable for useEffect deps.
  const refreshToken = (searchParams.r as string) || "";

  // New filter URL params
  const urlQ = (searchParams.q as string) || "";
  const urlCategoryId = (searchParams.categoryId as string) || "";
  const urlCategoryUncategorised = (searchParams.categoryUncategorised as string) || "";
  const urlCategoryKind = (searchParams.categoryKind as string) || "";
  const urlPendingAiReview = (searchParams.pendingAiReview as string) || "";
  const urlTagIdsRaw = (searchParams.tagIds as string) || "";
  const urlTagNone = (searchParams.tagNone as string) || "";

  const activeCategoryValue = decodeCategoryUrlParams(urlCategoryId, urlCategoryUncategorised, urlCategoryKind, urlPendingAiReview);
  const activeTagIds = decodeTagIdsFromUrl(urlTagIdsRaw);
  const tagFilterActive = activeTagIds.length > 0 || urlTagNone === "true";

  const PAGE_SIZE = 200;

  const [rows, setRows] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showRecategorise, setShowRecategorise] = useState(false);
  const [bulkAiOpen, setBulkAiOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkAiInitial, setBulkAiInitial] = useState<{ runId: string; totalQueued: number } | null>(null);
  const [applyTx, setApplyTx] = useState<PaymentQueueItem | null>(null);

  function toQueueItem(t: Transaction): PaymentQueueItem {
    // Compute unallocated from transaction.amount minus the sum of any existing
    // allocations. If allocations aren't included in the table's transaction
    // shape, default unallocated to transaction.amount (the backend will
    // recompute on apply if anything is stale).
    const allocSum = (t as any).allocations?.reduce(
      (acc: number, a: any) => acc + Number(a.amount),
      0,
    ) ?? 0;
    const tagsForRow = ((t as any).transactionTags ?? []).map((tt: any) => ({
      id: tt.tag.id, name: tt.tag.name, color: tt.tag.color ?? null,
    }));
    return {
      id: t.id,
      date: typeof t.date === "string" ? t.date.slice(0, 10) : new Date(t.date).toISOString().slice(0, 10),
      amount: String(t.amount),
      description: t.description,
      accountId: t.accountId,
      accountName: (t as any).account?.name ?? "",
      linkedCustomerId: null,
      linkedCustomerName: null,
      tags: tagsForRow,
      unallocated: String(Number(t.amount) - allocSum),
    };
  }

  // Selection state — ephemeral, not URL-driven.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Ref for the header checkbox to support indeterminate state.
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Local input mirrors for the filter panel before user clicks Apply.
  const [tempDateFrom, setTempDateFrom] = useState(dateFrom);
  const [tempDateTo, setTempDateTo] = useState(dateTo);
  const [tempAccountIds, setTempAccountIds] = useState<string[]>(selectedAccountIds);
  const [tempQ, setTempQ] = useState(urlQ);
  const [tempCategoryValue, setTempCategoryValue] = useState(activeCategoryValue || "__any__");
  const [tempTagIds, setTempTagIds] = useState<string[]>(activeTagIds);
  const [tempTagNone, setTempTagNone] = useState<boolean>(urlTagNone === "true");

  // Re-sync temp state from URL whenever the panel is opened.
  // This ensures Cancel leaves the panel values consistent with the URL.
  useEffect(() => {
    if (filterOpen) {
      setTempDateFrom(dateFrom);
      setTempDateTo(dateTo);
      setTempAccountIds(selectedAccountIds);
      setTempQ(urlQ);
      setTempCategoryValue(activeCategoryValue);
      setTempTagIds(activeTagIds);
      setTempTagNone(urlTagNone === "true");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Decode category params for the API call
    const catParams: {
      categoryId?: string;
      categoryUncategorised?: boolean;
      categoryKind?: CategoryKind;
      pendingAiReview?: boolean;
    } = {};
    if (urlCategoryId) {
      catParams.categoryId = urlCategoryId;
    } else if (urlCategoryUncategorised === "true") {
      catParams.categoryUncategorised = true;
    } else if (urlPendingAiReview === "true") {
      catParams.pendingAiReview = true;
    } else if (urlCategoryKind) {
      catParams.categoryKind = urlCategoryKind as CategoryKind;
    }

    const tagParams: { tagIds?: string[]; tagNone?: boolean } = {};
    if (activeTagIds.length > 0) tagParams.tagIds = activeTagIds;
    else if (urlTagNone === "true") tagParams.tagNone = true;

    listTransactions({
      accountIds: selectedAccountIds.length ? selectedAccountIds : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      q: urlQ || undefined,
      ...catParams,
      ...tagParams,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setRows(res.items);
        setTotalCount(res.totalCount);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [
    sortBy, sortDir, page, dateFrom, dateTo,
    selectedAccountIds.join(","), refreshToken,
    urlQ, urlCategoryId, urlCategoryUncategorised, urlCategoryKind, urlPendingAiReview,
    urlTagIdsRaw, urlTagNone,
  ]);

  function patchQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(urlSearch);
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleSort(key: SortKey) {
    if (sortBy !== key) patchQuery({ sortBy: key, sortDir: "asc", page: "1" });
    else patchQuery({ sortDir: sortDir === "asc" ? "desc" : "asc", page: "1" });
  }

  function applyFilters() {
    patchQuery({
      dateFrom: tempDateFrom || null,
      dateTo: tempDateTo || null,
      accountIds: mode === "global"
        ? (tempAccountIds.length ? tempAccountIds.join(",") : null)
        : null,
      q: tempQ || null,
      ...encodeCategoryUrlParams(tempCategoryValue),
      ...encodeTagUrlParams(tempTagIds, tempTagNone),
      page: "1",
    });
    setFilterOpen(false);
  }

  function clearFilters() {
    setTempDateFrom("");
    setTempDateTo("");
    setTempAccountIds([]);
    setTempQ("");
    setTempCategoryValue("__any__");
    setTempTagIds([]);
    setTempTagNone(false);
    patchQuery({
      dateFrom: null, dateTo: null, accountIds: null,
      q: null,
      categoryId: null, categoryUncategorised: null, categoryKind: null, pendingAiReview: null,
      tagIds: null, tagNone: null,
      page: "1",
    });
  }

  // ---- selection helpers ----
  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const visibleIds = rows.map((r) => r.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  }

  // Keep header checkbox indeterminate state in sync.
  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (!el) return;
    const visibleIds = rows.map((r) => r.id);
    const selectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;
    el.indeterminate = selectedCount > 0 && selectedCount < visibleIds.length;
  }, [selectedIds, rows]);

  // ---- bulk actions ----
  async function bulkCategorise(force: boolean) {
    const r = await bulkSuggest({ transactionIds: [...selectedIds], force });
    setBulkAiInitial(r);
    setBulkAiOpen(true);
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} transaction${count === 1 ? '' : 's'}? This will also remove their splits and categorisation history.`)) return;
    await bulkDeleteTransactions([...selectedIds]);
    setSelectedIds(new Set());
    const params = new URLSearchParams(urlSearch.toString());
    params.set('r', String(Date.now()));
    router.replace(`${pathname}?${params.toString()}`);
  }

  const cols: Array<{ key: SortKey | "account" | "category" | "tags" | "actions" | "select" | "balance"; label: string; align?: "right" | "center"; sortable: boolean; width: string }> = [
    { key: "select", label: "", sortable: false, width: "40px" },
    { key: "date", label: "Date", sortable: true, width: "110px" },
    { key: "description", label: "Description", sortable: true, width: "2fr" },
    { key: "category", label: "Category", sortable: false, width: "1fr" },
    { key: "amount", label: "Amount", align: "right", sortable: true, width: "1fr" },
    { key: "balance", label: "Balance", align: "right", sortable: false, width: "1fr" },
  ];
  if (mode === "global") {
    cols.push({ key: "tags", label: "Tags", sortable: false, width: "1fr" });
    cols.push({ key: "account", label: "Account", sortable: false, width: "1fr" });
  }
  cols.push({ key: "actions", label: "", sortable: false, width: "48px" });

  const gridTemplate = cols.map((c) => c.width).join(" ");

  const activeFilters =
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (mode === "global" && selectedAccountIds.length ? 1 : 0) +
    (urlQ ? 1 : 0) +
    (activeCategoryValue && activeCategoryValue !== "__any__" ? 1 : 0) +
    (tagFilterActive ? 1 : 0);

  // Categories sorted by sortOrder then name, for the category select.
  const sortedCategories = [...categories].sort((a, b) =>
    a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          {loading ? "Loading…" : `${totalCount.toLocaleString("en-AU")} transaction${totalCount === 1 ? "" : "s"}`}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add Transaction
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowRecategorise(true)}>
            Re-categorise
          </Button>
          <Button type="button" variant="outline" onClick={() => setBulkAiOpen(true)}>
            <Sparkles className="h-4 w-4" /> Categorise with AI
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilterOpen((o) => !o)}
            className={cn(filterOpen && "border-indigo-300 bg-indigo-50/40")}
          >
            <Filter className="h-4 w-4" /> Filter
            {activeFilters > 0 && (
              <span className="ml-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                {activeFilters}
              </span>
            )}
          </Button>
        </div>
      </div>

      {filterOpen && (
        <Card className="p-4" style={{ background: "rgb(212 215 225 / 79%)" }}>
          {/* Row 1: Search + Category + Tags */}
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Search</label>
              <Input
                type="search"
                placeholder="Search transactions…"
                value={tempQ}
                onChange={(e) => setTempQ(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
              <Select value={tempCategoryValue} onValueChange={setTempCategoryValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Any category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any category</SelectItem>
                  <SelectItem value="__uncategorised">— Uncategorised —</SelectItem>
                  <SelectItem value="__pending_ai_review" className="italic text-indigo-700">— Pending AI review —</SelectItem>
                  <SelectItem value="__sep_kinds__" disabled>────────────────</SelectItem>
                  <SelectItem value="__kind:INCOME" className="italic text-emerald-700">All Income</SelectItem>
                  <SelectItem value="__kind:EXPENSE" className="italic text-red-700">All Expense</SelectItem>
                  <SelectItem value="__kind:TRANSFER" className="italic text-blue-700">All Transfer</SelectItem>
                  {sortedCategories.length > 0 && (
                    <SelectItem value="__sep_cats__" disabled>────────────────</SelectItem>
                  )}
                  {sortedCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tags</label>
              <TagMultiSelect
                tags={tags}
                selectedIds={tempTagIds}
                onChange={(next) => {
                  setTempTagIds(next);
                  if (next.length > 0) setTempTagNone(false);
                }}
                placeholder={tempTagNone ? "— Untagged only —" : "Any tags"}
              />
              <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={tempTagNone}
                  onChange={(e) => {
                    setTempTagNone(e.target.checked);
                    if (e.target.checked) setTempTagIds([]);
                  }}
                />
                Untagged only
              </label>
            </div>
          </div>

          {/* Row 2: Date from + Date to + Accounts (multi-select dropdown) */}
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Date from</label>
              <Input type="date" value={tempDateFrom} onChange={(e) => setTempDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Date to</label>
              <Input type="date" value={tempDateTo} onChange={(e) => setTempDateTo(e.target.value)} />
            </div>
            {mode === "global" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Accounts</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-full items-center justify-between rounded-[0.3rem] border border-slate-300 bg-white px-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <span className="truncate">
                        {tempAccountIds.length === 0
                          ? "All accounts"
                          : tempAccountIds.length === 1
                            ? accounts.find((a) => a.id === tempAccountIds[0])?.name ?? "1 account"
                            : `${tempAccountIds.length} accounts`}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="max-h-72 w-[--radix-dropdown-menu-trigger-width] overflow-auto p-1">
                    {accounts.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-slate-400">No accounts</div>
                    )}
                    {accounts.map((a) => {
                      const on = tempAccountIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() =>
                            setTempAccountIds((curr) =>
                              curr.includes(a.id) ? curr.filter((x) => x !== a.id) : [...curr, a.id],
                            )
                          }
                          className="flex w-full items-center gap-2 rounded-[0.2rem] px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <span className="grid h-4 w-4 flex-shrink-0 place-items-center rounded border border-slate-300 bg-white">
                            {on && <Check className="h-3 w-3 text-indigo-600" />}
                          </span>
                          <span className="truncate">{a.name}</span>
                        </button>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Row 3: Action buttons */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button>
            <Button type="button" onClick={applyFilters}>Apply</Button>
          </div>
        </Card>
      )}

      <Card className="flex max-h-[calc(100vh-12rem)] flex-col overflow-hidden">
        {selectedIds.size > 0 && (
          <div className="shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
            <span className="text-sm font-medium text-slate-700">{selectedIds.size} selected</span>
            <Button type="button" size="sm" variant="outline" onClick={() => bulkCategorise(false)}>
              <Sparkles className="h-3.5 w-3.5" /> Categorise with AI
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => bulkCategorise(true)}>
              <RefreshCw className="h-3.5 w-3.5" /> Re-categorise with AI
            </Button>
            <Button type="button" size="sm" variant="outline" className="text-rose-600 hover:text-rose-700 hover:border-rose-300" onClick={bulkDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        )}
        <div
          className="grid shrink-0 items-center gap-x-4 border-b border-slate-100 bg-white px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {cols.map((c) => {
            if (c.key === "select") {
              const visibleIds = rows.map((r) => r.id);
              const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
              return (
                <div key="select" className="flex items-center">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    aria-label="Select all visible"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
                  />
                </div>
              );
            }
            const isActive = sortBy === c.key;
            const justify = c.align === "right" ? "justify-end" : c.align === "center" ? "justify-center" : "justify-start";
            return (
              <div
                key={c.key}
                className={cn("flex items-center gap-1", justify, c.sortable && "cursor-pointer select-none hover:text-slate-600")}
                onClick={c.sortable ? () => toggleSort(c.key as SortKey) : undefined}
              >
                <span>{c.label}</span>
                {c.sortable ? (
                  isActive ? (
                    sortDir === "asc" ? <ChevronUp className="h-3 w-3 text-slate-700" /> : <ChevronDown className="h-3 w-3 text-slate-700" />
                  ) : (
                    <ChevronsUpDown className="h-3 w-3 text-slate-300" />
                  )
                ) : null}
              </div>
            );
          })}
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {!loading && rows.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-slate-400">No transactions for this filter.</li>
          )}
          {rows.map((t) => {
            const highlight = searchParams.highlight === t.id;
            const isSelected = selectedIds.has(t.id);
            return (
              <li key={t.id} className={cn("transition-colors", highlight && "bg-amber-100/80", isSelected && "bg-indigo-50/60")}>
                <div className="grid items-center gap-x-4 px-5 py-3 text-sm" style={{ gridTemplateColumns: gridTemplate }}>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      aria-label={`Select transaction ${t.id}`}
                      checked={isSelected}
                      onChange={() => toggleRow(t.id)}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
                    />
                  </div>
                  <div className="text-slate-700">{t.date.slice(0, 10)}</div>
                  <div className="min-w-0 truncate text-slate-700">{t.description}</div>
                  <div className="min-w-0 truncate">
                    {t.category ? (
                      <span className={`inline-block rounded-[0.3rem] px-2 py-0.5 text-xs ${CATEGORY_KINDS.find((k) => k.value === t.category?.kind)?.tone ?? "bg-slate-100"}`}>
                        {t.category.name}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                    {mode === "account" && (t.transactionTags?.length ?? 0) > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {t.transactionTags!.map((tt) => (
                          <span key={tt.tag.id} className="rounded-full bg-slate-100 px-1.5 py-0 text-[10px] text-slate-600">
                            {tt.tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right"><TransactionAmountCell amount={t.amount} /></div>
                  <div className="text-right font-mono tabular-nums text-slate-500">
                    {t.runningBalance != null
                      ? `$${Number(t.runningBalance).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                  </div>
                  {mode === "global" && (
                    <div className="flex flex-wrap gap-1">
                      {(t.transactionTags?.length ?? 0) === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        t.transactionTags!.map((tt) => (
                          <span key={tt.tag.id} className="rounded-full bg-slate-100 px-1.5 py-0 text-[10px] text-slate-600">
                            {tt.tag.name}
                          </span>
                        ))
                      )}
                    </div>
                  )}
                  {mode === "global" && (
                    <div className="text-slate-500">
                      <Link href={`/accounts/${t.accountId}`} className="hover:underline">{t.account?.name}</Link>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <TransactionRowMenu
                      transaction={t}
                      accounts={accounts}
                      categories={categories}
                      tags={tags}
                      onApplyToInvoices={(tx) => setApplyTx(toQueueItem(tx))}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <Pagination
          page={page - 1}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onChange={(p) => patchQuery({ page: String(p + 1) })}
        />
      </Card>
      {showRecategorise && (
        <RecategoriseDialog
          filter={{
            accountIds: selectedAccountIds.length ? selectedAccountIds : undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
          }}
          onClose={() => setShowRecategorise(false)}
        />
      )}
      <BulkAiCategoriseDialog
        accounts={accounts}
        open={bulkAiOpen}
        onClose={() => { setBulkAiOpen(false); setBulkAiInitial(null); }}
        initialRunId={bulkAiInitial}
      />
      {addOpen && (
        <TransactionEditModal
          // transaction omitted → create mode
          accounts={accounts}
          categories={categories}
          tags={tags}
          onClose={() => setAddOpen(false)}
          onCreated={() => { router.refresh(); }}
        />
      )}
      {applyTx && (
        <ApplyPaymentModal
          context="transaction"
          transaction={applyTx}
          customers={customers}
          onClose={() => setApplyTx(null)}
          onApplied={() => { setApplyTx(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
