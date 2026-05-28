"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";
import { motion } from "framer-motion";
import type { Account } from "@/lib/types";
import { getTagsReport, type TagsReportResponse } from "@/lib/reports";
import { AccountMultiSelect } from "./account-multi-select";

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

function pct(numer: number, denom: number): string {
  if (denom <= 0) return "—";
  return `${((numer / denom) * 100).toFixed(1)}%`;
}

export function TagsReportPage({
  accounts,
  prefs,
}: {
  accounts: Account[];
  prefs: { financialYearStart: number };
}) {
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [from, setFrom] = useState(() => fyStartDate(prefs.financialYearStart));
  const [to, setTo] = useState(() => todayLocal());
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() => accounts.map((a) => a.id));
  const [report, setReport] = useState<TagsReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTagsReport({ kind, from, to, accountIds: selectedAccountIds })
      .then((r) => { if (!cancelled) setReport(r); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Failed to load report"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, from, to, selectedAccountIds.join(",")]);

  const dedupNum = report ? Number(report.dedupTotal) : 0;
  const taggedNum = report ? Number(report.taggedTotal) : 0;
  const untaggedNum = report ? Number(report.untaggedTotal) : 0;
  const overlapNum = report ? Number(report.overlapTotal) : 0;
  const sumOfTagsNum = report ? Number(report.sumOfTagTotals) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto max-w-5xl p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Tags Report</h1>
      </div>

      <Card className="space-y-5 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Side:</span>
            <Select value={kind} onValueChange={(v) => setKind(v as "EXPENSE" | "INCOME")}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">Expense</SelectItem>
                <SelectItem value="INCOME">Income</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Date:</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <span className="text-slate-400">—</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Accounts:</span>
            <AccountMultiSelect accounts={accounts} selected={selectedAccountIds} onChange={setSelectedAccountIds} />
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Header totals */}
        {report && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-[0.3rem] bg-slate-50 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">De-duplicated total</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">${fmtMoney(report.dedupTotal)}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{report.dedupCount} txn{report.dedupCount === 1 ? "" : "s"}</div>
              </div>
              <div className="rounded-[0.3rem] bg-emerald-50 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-700">Tagged total</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-900">${fmtMoney(report.taggedTotal)}</div>
                <div className="mt-0.5 text-[10px] text-emerald-700">{report.taggedCount} txn{report.taggedCount === 1 ? "" : "s"} · {pct(taggedNum, dedupNum)} of dedup</div>
              </div>
              <div className="rounded-[0.3rem] bg-slate-100 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Untagged total</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-700">${fmtMoney(report.untaggedTotal)}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{report.untaggedCount} txn{report.untaggedCount === 1 ? "" : "s"}</div>
              </div>
              <div className="rounded-[0.3rem] bg-amber-50 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-amber-800">Overlap</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-amber-900">${fmtMoney(report.overlapTotal)}</div>
                <div className="mt-0.5 text-[10px] text-amber-800">counted in 2+ tags · {pct(overlapNum, taggedNum)} of tagged</div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-[0.3rem] border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <p>
                Tags are not mutually exclusive. A transaction with multiple tags counts under each, so the sum of the tag rows below
                {sumOfTagsNum > 0 ? (
                  <> is <strong>${fmtMoney(report.sumOfTagTotals)}</strong> &mdash; <strong>{pct(sumOfTagsNum, dedupNum)}</strong> of the de-duplicated total. The difference between the tag-row sum and the tagged total above is the <em>overlap</em>: amounts that appear in 2+ tags.</>
                ) : (
                  <> may exceed the de-duplicated total whenever tags overlap.</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Table */}
        {loading && <div className="py-12 text-center text-sm text-slate-400">Loading…</div>}
        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {report && !loading && (
          <div className="overflow-hidden rounded-[0.3rem] border border-slate-100">
            <div className="grid grid-cols-[2fr_140px_120px_140px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <span>Tag</span>
              <span className="text-right">Amount</span>
              <span className="text-right">% of dedup</span>
              <span className="text-right">Txns</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {report.tags.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-slate-400">
                  No tagged transactions in this range. Tag a few transactions in the edit modal,
                  or open <span className="font-mono">/tags</span> and hit "Re-apply all to existing".
                </li>
              )}
              {report.tags.map((t) => (
                <li key={t.id} className="grid grid-cols-[2fr_140px_120px_140px] items-center gap-3 px-4 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    {t.color && (
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: t.color.startsWith("#") ? t.color : `#${t.color}` }}
                      />
                    )}
                    <span className="font-medium text-slate-900">{t.name}</span>
                  </span>
                  <span className="text-right tabular-nums text-slate-700">${fmtMoney(t.total)}</span>
                  <span className="text-right text-xs tabular-nums text-slate-500">{pct(Number(t.total), dedupNum)}</span>
                  <span className="text-right text-xs tabular-nums text-slate-500">{t.count}</span>
                </li>
              ))}
              {report.tags.length > 0 && (
                <li className="grid grid-cols-[2fr_140px_120px_140px] items-center gap-3 border-t-2 border-slate-200 bg-slate-50/60 px-4 py-2 text-sm font-medium">
                  <span className="text-slate-600">Sum of tag rows</span>
                  <span className="text-right tabular-nums text-slate-900">${fmtMoney(report.sumOfTagTotals)}</span>
                  <span className="text-right text-xs tabular-nums text-slate-500">{pct(sumOfTagsNum, dedupNum)}</span>
                  <span></span>
                </li>
              )}
              {overlapNum > 0 && (
                <li className="grid grid-cols-[2fr_140px_120px_140px] items-center gap-3 bg-amber-50/40 px-4 py-2 text-sm">
                  <span className="text-amber-800">▲ Overlap (counted in 2+ tags)</span>
                  <span className="text-right tabular-nums text-amber-900">${fmtMoney(report.overlapTotal)}</span>
                  <span className="text-right text-xs tabular-nums text-amber-700">{pct(overlapNum, dedupNum)}</span>
                  <span></span>
                </li>
              )}
            </ul>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
