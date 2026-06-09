"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  retentionStats,
  retentionPurge,
  retentionPolicies,
  retentionUpsertPolicy,
  type RetentionAge,
  type RetentionPolicy,
  type RetentionTable,
} from "@/lib/retention";
import { apiClient } from "@/lib/api";

const TABLES: { key: RetentionTable; label: string; note?: string }[] = [
  { key: "AuditLog", label: "Audit log", note: "Login events, role changes, deletes" },
  { key: "TransactionImport", label: "Import logs", note: "CSV import receipts" },
  { key: "AllocationEvent", label: "Allocation events", note: "Payment apply/un-apply audit" },
  { key: "CategorisationEvent", label: "Categorisation events", note: "AI uses recent events as training — purge cautiously" },
  { key: "AiCall", label: "AI calls", note: "One row per AI request/response" },
  { key: "Session", label: "Sessions", note: "Expired sessions are auto-purged hourly" },
];

const AGE_OPTIONS: { value: RetentionAge | "all"; label: string }[] = [
  { value: "7d",  label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y",  label: "1 year" },
  { value: "all", label: "All (purge everything)" },
];

const POLICY_AGE_OPTIONS: { value: RetentionAge; label: string }[] = [
  { value: "7d",  label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y",  label: "1 year" },
];

export function DataRetentionAdminPage() {
  const [stats, setStats] = useState<Record<string, { count: number; oldestAt: string | null }> | null>(null);
  const [policies, setPolicies] = useState<Map<RetentionTable, RetentionPolicy>>(new Map());
  const [trashCount, setTrashCount] = useState<number | null>(null);
  const [age, setAge] = useState<Record<string, RetentionAge | "all">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [s, ps, trash] = await Promise.all([
        retentionStats(),
        retentionPolicies(),
        apiClient.get<Array<{ id: string }>>("/invoices/trash").catch(() => []),
      ]);
      setStats(s);
      setPolicies(new Map(ps.map((p) => [p.table, p])));
      setTrashCount(trash.length);
    } catch (e: any) { setError(e?.message ?? "Load failed."); }
  };
  useEffect(() => { void load(); }, []);

  const emptyBin = async () => {
    if (!window.confirm(`Permanently delete ${trashCount ?? 0} invoice(s) in the recycle bin? This cannot be undone.`)) return;
    setBusy("__bin__"); setError(null);
    try {
      await apiClient.post<{ purged: number }>("/invoices/trash/purge-all", {});
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Empty bin failed.");
    } finally {
      setBusy(null);
    }
  };

  const purge = async (t: RetentionTable) => {
    const selected = age[t] ?? policies.get(t)?.cutoffAge ?? "1y";
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

  const savePolicy = async (t: RetentionTable, next: Partial<{ cutoffAge: RetentionAge; enabled: boolean }>) => {
    const current = policies.get(t);
    const cutoffAge = (next.cutoffAge ?? current?.cutoffAge ?? "1y") as RetentionAge;
    const enabled = next.enabled ?? current?.enabled ?? false;
    setError(null);
    try {
      const updated = await retentionUpsertPolicy(t, { cutoffAge, enabled });
      setPolicies((p) => new Map(p).set(t, updated));
    } catch (e: any) {
      setError(e?.message ?? "Save failed.");
    }
  };

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Data Retention</h2>
        <p className="text-sm text-slate-500">
          Free disk space by deleting old log entries. Toggle <em>Auto-purge at selected interval</em> to
          have the configured cutoff enforced as a rolling window — a nightly check at 03:15 deletes
          only the rows that have aged past the cutoff (e.g. "Older than 1 year"); rows newer than
          that stay put. The <em>Purge now</em> button is a manual one-shot using the dropdown next
          to it.
        </p>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      <div className="space-y-2">
        {TABLES.map((t) => {
          const s = stats?.[t.key];
          const policy = policies.get(t.key);
          const policyAge = (policy?.cutoffAge ?? "1y") as RetentionAge;
          return (
            <div
              key={t.key}
              className="grid grid-cols-1 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1.4fr_0.9fr_0.9fr_auto_auto]"
            >
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
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!policy?.enabled}
                    onCheckedChange={(v) => savePolicy(t.key, { enabled: v })}
                  />
                  <span className="text-xs text-slate-600">Auto-purge at selected interval</span>
                </div>
                <Select
                  value={policyAge}
                  onValueChange={(v) => savePolicy(t.key, { cutoffAge: v as RetentionAge })}
                >
                  <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{POLICY_AGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>Older than {o.label}</SelectItem>)}</SelectContent>
                </Select>
                {policy?.lastRunAt ? (
                  <div className="text-[10px] text-slate-400">
                    Last auto-run: {new Date(policy.lastRunAt).toLocaleString()}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={age[t.key] ?? "1y"}
                  onValueChange={(v) => setAge((p) => ({ ...p, [t.key]: v as RetentionAge | "all" }))}
                >
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{AGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>Older than {o.label}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="destructive" onClick={() => purge(t.key)} disabled={busy === t.key}>
                  {busy === t.key ? "Purging…" : "Purge now"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="text-base font-semibold text-slate-900">Recycle bin</h3>
        <p className="mt-1 text-sm text-slate-500">
          Deleted invoices are kept in the bin indefinitely and never auto-purged. Use
          <em> Empty Recycle Bin </em>
          to permanently delete every soft-deleted invoice in one shot. There is no undo.
        </p>
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex-1 text-sm text-slate-600">
            {trashCount === null ? (
              <span className="text-slate-400">…</span>
            ) : (
              <>
                <span className="font-mono">{trashCount.toLocaleString()}</span> invoice{trashCount === 1 ? "" : "s"} currently in the bin
              </>
            )}
          </div>
          <Button
            variant="destructive"
            onClick={emptyBin}
            disabled={busy === "__bin__" || !trashCount}
          >
            {busy === "__bin__" ? "Emptying…" : "Empty Recycle Bin"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
