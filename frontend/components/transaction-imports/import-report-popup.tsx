"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { ImportReport } from "@/lib/types";

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "err" }) {
  const palette =
    tone === "warn" ? "bg-amber-50 text-amber-900"
    : tone === "err" ? "bg-red-50 text-red-900"
    : tone === "ok" ? "bg-emerald-50 text-emerald-900"
    : "bg-slate-50 text-slate-900";
  return (
    <Card className={`p-4 ${palette}`}>
      <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString("en-AU")}</div>
    </Card>
  );
}

function Section({
  title, count, defaultOpen, children,
}: { title: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <span className="flex items-center gap-1">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {title} <span className="text-slate-400">({count.toLocaleString("en-AU")})</span>
        </span>
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </Card>
  );
}

function fmt(amount: string | number) {
  const n = Number(amount);
  return `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ImportReportPopup({ data, onClose }: { data: ImportReport; onClose?: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium text-slate-700">{data.accountName}</div>
        <div className="text-xs text-slate-500">
          {data.filename} · {new Date(data.importedAt).toLocaleString("en-AU")}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total" value={data.counts.total} />
        <StatCard label="Imported" value={data.counts.imported} tone="ok" />
        <StatCard label="Duplicates" value={data.counts.duplicates} tone={data.counts.duplicates ? "warn" : undefined} />
        <StatCard label="Failed" value={data.counts.failed} tone={data.counts.failed ? "err" : undefined} />
      </div>

      {data.warnings.length > 0 && (
        <Card className="bg-amber-50 p-3">
          {data.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4" /> {w}
            </div>
          ))}
        </Card>
      )}

      {data.ruleCategorisation && (
        <Section title="Categorisation" count={data.ruleCategorisation.ruleMatched} defaultOpen={true}>
          <div className="space-y-2 px-4 py-3 text-xs">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><div className="text-slate-500">Vendor matched</div><div className="font-semibold tabular-nums">{data.ruleCategorisation.vendorMatched}</div></div>
              <div><div className="text-slate-500">Rule matched</div><div className="font-semibold tabular-nums text-emerald-700">{data.ruleCategorisation.ruleMatched}</div></div>
              <div><div className="text-slate-500">Ambiguous vendor</div><div className="font-semibold tabular-nums text-amber-700">{data.ruleCategorisation.ambiguousVendor}</div></div>
            </div>
            {data.ruleCategorisation.perRule.length > 0 && (
              <div className="border-t border-slate-100 pt-2">
                <div className="mb-1 text-slate-500">Per rule:</div>
                <ul className="ml-4 list-disc space-y-0.5">
                  {data.ruleCategorisation.perRule.map((p) => (
                    <li key={p.ruleId}>
                      <span className="font-medium">{p.ruleName}</span> — {p.categoryName}: <span className="tabular-nums">{p.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Imported" count={data.imported.length} defaultOpen={false}>
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-xs">
          {data.imported.map((r, i) => (
            <li key={i} className="grid grid-cols-[110px_1fr_110px] gap-3 px-4 py-2">
              <span className="text-slate-600">{r.date}</span>
              <span className="truncate text-slate-700">{r.description}</span>
              <span className="text-right font-mono tabular-nums">{fmt(r.amount)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Duplicates (skipped)" count={data.duplicates.length} defaultOpen={data.duplicates.length > 0}>
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-xs">
          {data.duplicates.map((r, i) => (
            <li key={i} className="grid grid-cols-[110px_1fr_110px_auto] gap-3 px-4 py-2">
              <span className="text-slate-600">{r.date}</span>
              <span className="truncate text-slate-700">{r.description}</span>
              <span className="text-right font-mono tabular-nums">{fmt(r.amount)}</span>
              <Link
                href={`/accounts/${data.accountId}?highlight=${r.existingTransactionId}`}
                className="text-xs text-indigo-600 hover:underline"
              >
                view existing
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Failed" count={data.failed.length} defaultOpen={data.failed.length > 0}>
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-xs">
          {data.failed.map((r, i) => (
            <li key={i} className="grid grid-cols-[60px_1fr] gap-3 px-4 py-2">
              <span className="text-slate-500">#{r.rowIndex + 1}</span>
              <div>
                <div className="text-red-700">{r.reason}</div>
                <div className="mt-0.5 font-mono text-slate-500">{r.raw.join(" , ")}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {onClose && (
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>Close</Button>
        </div>
      )}
    </div>
  );
}
