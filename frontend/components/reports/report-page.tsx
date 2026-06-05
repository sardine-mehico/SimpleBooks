"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { motion } from "framer-motion";
import type { Account, ReportResponse, Tag } from "@/lib/types";
import { getExpenseReport, getIncomeReport } from "@/lib/reports";
import { CategoryPie, PIE_PALETTE } from "./category-pie";
import { TotalsTable } from "./totals-table";
import { AccountMultiSelect } from "./account-multi-select";
import { TagMultiSelect } from "@/components/tags/tag-multi-select";
import { exportReportToExcel } from "@/lib/export-excel";

function fyStartDate(financialYearStart: number): string {
  const now = new Date();
  const y = now.getMonth() + 1 >= financialYearStart ? now.getFullYear() : now.getFullYear() - 1;
  const m = String(financialYearStart).padStart(2, "0");
  return `${y}-${m}-01`;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtMoney(n: string | number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ReportPage({
  kind,
  accounts,
  tags,
  prefs,
}: {
  kind: "EXPENSE" | "INCOME";
  accounts: Account[];
  tags: Tag[];
  prefs: { financialYearStart: number };
}) {
  const [from, setFrom] = useState(() => fyStartDate(prefs.financialYearStart));
  const [to, setTo] = useState(() => todayLocal());
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() =>
    accounts.map((a) => a.id),
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Refetch whenever filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fetcher = kind === "EXPENSE" ? getExpenseReport : getIncomeReport;
    fetcher({ from, to, accountIds: selectedAccountIds, tagIds: selectedTagIds })
      .then((r) => {
        if (!cancelled) {
          setReport(r);
          setSelectedParentId(null);
        }
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? "Failed to load report");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, from, to, selectedAccountIds.join(","), selectedTagIds.join(",")]);

  const UNCAT_ID = "__uncategorised__";
  const parentSlices = useMemo(() => {
    if (!report) return [];
    const slices = report.parents.map((p) => ({ id: p.id, name: p.name, total: Number(p.total) }));
    if (Number(report.uncategorised) > 0) {
      slices.push({ id: UNCAT_ID, name: "Uncategorised", total: Number(report.uncategorised) });
    }
    return slices;
  }, [report]);

  const selectedParent = useMemo(() => {
    if (!selectedParentId || !report) return null;
    return report.parents.find((p) => p.id === selectedParentId) ?? null;
  }, [selectedParentId, report]);

  const childSlices = useMemo(() => {
    if (!selectedParent) return [];
    return selectedParent.children.map((c) => ({ id: c.id, name: c.name, total: Number(c.total) }));
  }, [selectedParent]);

  const drilldownColor = useMemo(() => {
    if (!selectedParentId) return undefined;
    const idx = parentSlices.findIndex((p) => p.id === selectedParentId);
    return PIE_PALETTE[idx % PIE_PALETTE.length];
  }, [selectedParentId, parentSlices]);

  async function onExport() {
    if (!report) return;
    setExporting(true);
    try {
      await exportReportToExcel(report);
    } finally {
      setExporting(false);
    }
  }

  const title = kind === "EXPENSE" ? "Expense Report" : "Income Report";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto max-w-6xl p-4 md:p-6"
    >
      <div className="mb-4 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <Button variant="outline" size="sm" onClick={onExport} disabled={!report || loading || exporting}>
          <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export to Excel"}
        </Button>
      </div>

      <Card className="space-y-5 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 text-sm md:flex-nowrap md:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Date:</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
            <span className="text-slate-400">—</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Accounts:</span>
            <AccountMultiSelect accounts={accounts} selected={selectedAccountIds} onChange={setSelectedAccountIds} className="w-44" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Tags:</span>
            <div className="w-44">
              <TagMultiSelect tags={tags} selectedIds={selectedTagIds} onChange={setSelectedTagIds} placeholder="All tags" />
            </div>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <CategoryPie
            title="By category"
            data={parentSlices}
            centerTotal={report ? fmtMoney(report.grandTotal) : "—"}
            onSelect={(id) => {
              if (id === UNCAT_ID) return;
              setSelectedParentId((prev) => (prev === id ? null : id));
            }}
          />
          {selectedParent && selectedParent.children.length > 0 ? (
            <CategoryPie
              title={`${selectedParent.name} subcategories`}
              data={childSlices}
              centerTotal={fmtMoney(selectedParent.total)}
              baseColor={drilldownColor}
            />
          ) : selectedParent ? (
            <div className="flex h-72 flex-col items-center justify-center gap-1 rounded-lg bg-slate-50 px-6 text-center text-sm">
              <div className="font-medium text-slate-700">{selectedParent.name}</div>
              <div className="text-2xl font-semibold text-slate-900">${fmtMoney(selectedParent.total)}</div>
              <div className="mt-2 italic text-slate-500">no subcategories yet</div>
              <div className="text-xs text-slate-400">
                add some from <span className="font-mono">/categories</span> using the
                {" "}
                <span className="inline-block rounded border border-slate-300 px-1 text-slate-600">+ Sub</span>
                {" "}
                button on this parent
              </div>
            </div>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
              <div>Click a category slice on the left</div>
              <div>to drill into its subcategories</div>
            </div>
          )}
        </div>

        <hr className="border-slate-100" />

        {/* Table */}
        {loading && <div className="py-12 text-center text-sm text-slate-400">Loading…</div>}
        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        {report && !loading && <TotalsTable report={report} />}
      </Card>
    </motion.div>
  );
}
