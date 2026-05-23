"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, ChevronUp, ChevronDown, ChevronsUpDown, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/data/pagination";
import { cn } from "@/lib/utils";
import { TransactionAmountCell } from "./transaction-amount-cell";
import { listTransactions } from "@/lib/banking";
import { CATEGORY_KINDS } from "@/lib/types";
import type { Account, Category, Transaction, Vendor } from "@/lib/types";
import { RecategoriseDialog } from "./recategorise-dialog";
import { BulkAiCategoriseDialog } from "./bulk-ai-categorise-dialog";
import { TransactionRowMenu } from "./transaction-row-menu";

type SortKey = "date" | "amount" | "description" | "runningBalance";

export function TransactionsTable({
  mode,
  fixedAccountId,
  accounts,
  categories,
  vendors,
  searchParams,
}: {
  mode: "account" | "global";
  fixedAccountId?: string;
  accounts: Account[];
  categories: Category[];
  vendors: Vendor[];
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearch = useSearchParams();

  // URL-driven state — parse on every render.
  const sortBy = (searchParams.sortBy as SortKey) || "date";
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

  const PAGE_SIZE = 200;

  const [rows, setRows] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showRecategorise, setShowRecategorise] = useState(false);
  const [bulkAiOpen, setBulkAiOpen] = useState(false);

  // Local input mirrors for the filter panel before user clicks Apply.
  const [tempDateFrom, setTempDateFrom] = useState(dateFrom);
  const [tempDateTo, setTempDateTo] = useState(dateTo);
  const [tempAccountIds, setTempAccountIds] = useState<string[]>(selectedAccountIds);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTransactions({
      accountIds: selectedAccountIds.length ? selectedAccountIds : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
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
  }, [sortBy, sortDir, page, dateFrom, dateTo, selectedAccountIds.join(","), refreshToken]);

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
      page: "1",
    });
    setFilterOpen(false);
  }

  function clearFilters() {
    setTempDateFrom("");
    setTempDateTo("");
    setTempAccountIds([]);
    patchQuery({ dateFrom: null, dateTo: null, accountIds: null, page: "1" });
  }

  const cols: Array<{ key: SortKey | "account" | "category" | "vendor" | "actions"; label: string; align?: "right" | "center"; sortable: boolean; width: string }> = [
    { key: "date", label: "Date", sortable: true, width: "110px" },
    { key: "description", label: "Description", sortable: true, width: "2fr" },
    { key: "category", label: "Category", sortable: false, width: "1fr" },
    { key: "amount", label: "Amount", align: "right", sortable: true, width: "1fr" },
    { key: "runningBalance", label: "Balance", align: "right", sortable: true, width: "1fr" },
  ];
  if (mode === "global") {
    cols.push({ key: "vendor", label: "Vendor", sortable: false, width: "1fr" });
    cols.push({ key: "account", label: "Account", sortable: false, width: "1fr" });
  }
  cols.push({ key: "actions", label: "", sortable: false, width: "48px" });

  const gridTemplate = cols.map((c) => c.width).join(" ");
  const activeFilters = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (mode === "global" && selectedAccountIds.length ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          {loading ? "Loading…" : `${totalCount.toLocaleString("en-AU")} transaction${totalCount === 1 ? "" : "s"}`}
        </div>
        <div className="flex items-center gap-2">
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                <div className="flex flex-wrap gap-1.5">
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
                        className={cn(
                          "rounded-[0.3rem] border px-2 py-1 text-xs",
                          on ? "border-indigo-400 bg-indigo-100 text-indigo-900" : "border-slate-300 bg-white text-slate-600",
                        )}
                      >
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button>
            <Button type="button" onClick={applyFilters}>Apply</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div
          className="grid items-center gap-x-4 border-b border-slate-100 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {cols.map((c) => {
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
        <ul className="divide-y divide-slate-100">
          {!loading && rows.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-slate-400">No transactions for this filter.</li>
          )}
          {rows.map((t) => {
            const highlight = searchParams.highlight === t.id;
            return (
              <li key={t.id} className={cn("transition-colors", highlight && "bg-amber-100/80")}>
                <div className="grid items-center gap-x-4 px-5 py-3 text-sm" style={{ gridTemplateColumns: gridTemplate }}>
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
                    {mode === "account" && t.vendor && (
                      <div className="mt-0.5 text-xs text-slate-500">{t.vendor.name}</div>
                    )}
                  </div>
                  <div className="text-right"><TransactionAmountCell amount={t.amount} /></div>
                  <div className="text-right font-mono tabular-nums text-slate-500">
                    {t.runningBalance != null
                      ? `$${Number(t.runningBalance).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                  </div>
                  {mode === "global" && (
                    <div className="text-xs text-slate-500">{t.vendor?.name ?? "—"}</div>
                  )}
                  {mode === "global" && (
                    <div className="text-slate-500">
                      <Link href={`/accounts/${t.accountId}`} className="hover:underline">{t.account?.name}</Link>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <TransactionRowMenu transaction={t} categories={categories} vendors={vendors} />
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
      <BulkAiCategoriseDialog accounts={accounts} open={bulkAiOpen} onClose={() => setBulkAiOpen(false)} />
    </div>
  );
}
