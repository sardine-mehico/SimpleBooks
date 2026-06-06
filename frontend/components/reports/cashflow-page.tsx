"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import type { Account, CashflowResponse } from "@/lib/types";
import { getCashflow } from "@/lib/reports";
import { AccountMultiSelect } from "./account-multi-select";
import { CashflowSankey } from "./cashflow-sankey";

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

export function CashflowPage({
  accounts,
  prefs,
}: {
  accounts: Account[];
  prefs: { financialYearStart: number };
}) {
  const [from, setFrom] = useState(() => fyStartDate(prefs.financialYearStart));
  const [to, setTo] = useState(() => todayLocal());
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() => accounts.map((a) => a.id));
  const [data, setData] = useState<CashflowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCashflow({ from, to, accountIds: selectedAccountIds })
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Failed to load cashflow"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, selectedAccountIds.join(",")]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto max-w-7xl p-4 md:p-6"
    >
      <div className="mb-4 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Cashflow</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm md:gap-4">
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
        </div>
      </div>

      <Card className="p-4 md:p-6">
        {error ? (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : (
          <CashflowSankey data={data} loading={loading} />
        )}
      </Card>
    </motion.div>
  );
}
