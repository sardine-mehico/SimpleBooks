"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { retentionStats, retentionPurge, type RetentionTable } from "@/lib/retention";

const TABLES: { key: RetentionTable; label: string; note?: string }[] = [
  { key: "AuditLog", label: "Audit log", note: "Login events, role changes, deletes" },
  { key: "TransactionImport", label: "Import logs", note: "CSV import receipts" },
  { key: "AllocationEvent", label: "Allocation events", note: "Payment apply/un-apply audit" },
  { key: "CategorisationEvent", label: "Categorisation events", note: "AI uses recent events as training — purge cautiously" },
  { key: "AiCall", label: "AI calls", note: "One row per AI request/response" },
  { key: "Session", label: "Sessions", note: "Expired sessions are auto-purged hourly" },
];

const AGE_OPTIONS: { value: "7d" | "30d" | "90d" | "1y" | "all"; label: string }[] = [
  { value: "7d",  label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y",  label: "1 year" },
  { value: "all", label: "All (purge everything)" },
];

export function DataRetentionAdminPage() {
  const [stats, setStats] = useState<Record<string, { count: number; oldestAt: string | null }> | null>(null);
  const [age, setAge] = useState<Record<string, "7d" | "30d" | "90d" | "1y" | "all">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { setStats(await retentionStats()); } catch (e: any) { setError(e?.message ?? "Load failed."); }
  };
  useEffect(() => { void load(); }, []);

  const purge = async (t: RetentionTable) => {
    const selected = age[t] ?? "90d";
    const ok = window.confirm(`Delete ${t} entries older than ${selected}? This cannot be undone.`);
    if (!ok) return;
    setBusy(t); setError(null);
    try {
      await retentionPurge(t, selected);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Purge failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Data Retention</h2>
        <p className="text-sm text-slate-500">
          Free disk space by deleting old log entries. Each row shows the current count and the oldest entry's age. Pick a cutoff and purge.
        </p>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      <div className="space-y-2">
        {TABLES.map((t) => {
          const s = stats?.[t.key];
          return (
            <div key={t.key} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1.5fr_1fr_1fr_auto]">
              <div>
                <div className="font-medium text-slate-900">{t.label}</div>
                {t.note ? <div className="text-xs text-slate-500">{t.note}</div> : null}
              </div>
              <div className="text-sm text-slate-600">
                {s ? <><span className="font-mono">{s.count.toLocaleString()}</span> entries</> : <span className="text-slate-400">…</span>}
              </div>
              <div className="text-sm text-slate-600">
                {s?.oldestAt ? <>Oldest: <span className="font-mono">{new Date(s.oldestAt).toLocaleDateString()}</span></> : <span className="text-slate-400">—</span>}
              </div>
              <div className="flex items-center gap-2">
                <Select value={age[t.key] ?? "90d"} onValueChange={(v) => setAge((p) => ({ ...p, [t.key]: v as any }))}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{AGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>Older than {o.label}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="destructive" onClick={() => purge(t.key)} disabled={busy === t.key}>
                  {busy === t.key ? "Purging…" : "Purge"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
