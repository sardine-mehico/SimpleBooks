"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, FlaskConical, Loader2 } from "lucide-react";
import { TransactionAmountCell } from "@/components/transactions/transaction-amount-cell";
import { testRules } from "@/lib/banking-rules";
import type { Account, EngineOutput, Rule } from "@/lib/types";

type Source = "existing" | "csv";

export function RuleTestSandbox({ rules, accounts }: { rules: Rule[]; accounts: Account[] }) {
  const [source, setSource] = useState<Source>("existing");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(
    new Set(rules.filter((r) => r.isActive && (r.state === "USER" || r.state === "APPROVED")).map((r) => r.id))
  );
  const [applyVendorMatch, setApplyVendorMatch] = useState(true);
  const [output, setOutput] = useState<EngineOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onCsvFile(_e: React.ChangeEvent<HTMLInputElement>) {
    alert("CSV upload for sandbox: please import this CSV via /accounts first, then test against existing transactions. (Direct CSV-mode is a stretch goal.)");
  }

  async function onRun() {
    setRunning(true); setError(null);
    try {
      const result = await testRules({
        source,
        accountIds: source === "existing" && accountIds.length ? accountIds : undefined,
        dateFrom: source === "existing" ? dateFrom || undefined : undefined,
        dateTo: source === "existing" ? dateTo || undefined : undefined,
        ruleIds: Array.from(selectedRuleIds),
        applyVendorMatch,
      });
      setOutput(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="px-6 py-6 md:px-8 md:py-8 space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/rules"
          aria-label="Back to rules"
          className="grid h-9 w-9 place-items-center rounded-[0.3rem] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Test Rules</h1>
      </div>
      <Card className="border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <div className="font-semibold text-amber-900">Rules Test Ground</div>
            <div className="text-sm text-amber-900">This is a sandbox. Nothing on this page changes any transaction. No categorisations are written. No rules are modified.</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Test source</h2>
          <Field label="Source">
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={source === "existing"} onChange={() => setSource("existing")} />
                Existing transactions
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={source === "csv"} onChange={() => setSource("csv")} />
                Upload a CSV
              </label>
            </div>
          </Field>
          {source === "existing" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date from"><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
                <Field label="Date to"><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
              </div>
              <Field label="Accounts (empty = all)">
                <div className="flex flex-wrap gap-1.5">
                  {accounts.map((a) => {
                    const on = accountIds.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAccountIds((curr) => curr.includes(a.id) ? curr.filter((x) => x !== a.id) : [...curr, a.id])}
                        className={`rounded-[0.3rem] border px-2 py-1 text-xs ${on ? "border-indigo-400 bg-indigo-100 text-indigo-900" : "border-slate-300 bg-white text-slate-600"}`}
                      >{a.name}</button>
                    );
                  })}
                </div>
              </Field>
            </>
          )}
          {source === "csv" && (
            <Field label="CSV file">
              <input type="file" accept=".csv,text/csv" onChange={onCsvFile} className="text-sm" />
            </Field>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Rules to include</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selectedRuleIds.size === rules.length}
              onChange={(e) => setSelectedRuleIds(e.target.checked ? new Set(rules.map((r) => r.id)) : new Set())}
              className="h-4 w-4"
            />
            <span>All rules ({rules.length})</span>
          </label>
          <div className="max-h-72 space-y-1 overflow-auto">
            {rules.length === 0 && (
              <div className="text-xs text-slate-400">No rules yet. Create one at <Link href="/rules/new" className="underline">/rules/new</Link>.</div>
            )}
            {rules.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedRuleIds.has(r.id)}
                  onChange={(e) => {
                    setSelectedRuleIds((curr) => {
                      const next = new Set(curr);
                      if (e.target.checked) next.add(r.id); else next.delete(r.id);
                      return next;
                    });
                  }}
                  className="h-4 w-4"
                />
                <span>{r.name}</span>
                {!r.isActive && <span className="text-xs text-slate-400">(inactive)</span>}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm pt-2 border-t border-slate-100">
            <input type="checkbox" checked={applyVendorMatch} onChange={(e) => setApplyVendorMatch(e.target.checked)} className="h-4 w-4" />
            <span>Include vendor matching pass</span>
          </label>
        </Card>
      </div>

      <div className="flex justify-center">
        <Button type="button" onClick={onRun} disabled={running} size="lg">
          {running ? <><Loader2 className="h-4 w-4 animate-spin"/> Testing...</> : <><FlaskConical className="h-4 w-4"/> Test rules</>}
        </Button>
      </div>

      {error && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</Card>}

      {output && (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 md:grid-cols-5">
            <Stat label="Tested" value={output.stats.total} />
            <Stat label="Vendor matched" value={output.stats.vendorMatched} />
            <Stat label="Rule matched" value={output.stats.ruleMatched} tone="ok" />
            <Stat label="No rule match" value={output.stats.unchanged} />
            <Stat label="Skipped split" value={output.stats.preservedSplits} tone="warn" />
          </div>
          <ul className="divide-y divide-slate-100">
            <li className="grid grid-cols-[110px_2fr_120px_140px_2fr_1fr] gap-3 bg-slate-50 px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <span>Date</span><span>Description</span><span className="text-right">Amount</span><span>Vendor</span><span>Rule that wins</span><span>Category</span>
            </li>
            {output.rows.map((r) => (
              <li key={r.transactionId} className="grid grid-cols-[110px_2fr_120px_140px_2fr_1fr] gap-3 px-5 py-2 text-xs">
                <span className="text-slate-700">{r.date.slice(0,10)}</span>
                <span className="truncate text-slate-700">{r.description}</span>
                <span className="text-right"><TransactionAmountCell amount={r.amount} /></span>
                <span className="text-slate-600">
                  {r.vendorMatch ? r.vendorMatch.vendorName : "—"}
                  {r.vendorMatchAmbiguous && <span className="ml-1 text-amber-700">(ambiguous)</span>}
                </span>
                <span className="text-slate-700">
                  {r.ruleMatch ? (
                    <Link href={`/rules/${r.ruleMatch.ruleId}/edit`} className="text-indigo-700 hover:underline" target="_blank">
                      #{r.ruleMatch.priority} {r.ruleMatch.ruleName}
                    </Link>
                  ) : <span className="text-slate-400">(no match)</span>}
                  {r.allMatchingRules.length > 1 && (
                    <span className="ml-2 text-xs text-slate-400">+{r.allMatchingRules.length - 1} also matched</span>
                  )}
                </span>
                <span className="text-slate-700">{r.ruleMatch?.categoryName ?? <span className="text-slate-400">(uncategorised)</span>}</span>
              </li>
            ))}
            {output.rows.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-slate-400">No transactions matched the source filter.</li>
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const palette = tone === "ok" ? "bg-emerald-50 text-emerald-900" : tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-900";
  return (
    <div className={`rounded-[0.3rem] p-3 ${palette}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
