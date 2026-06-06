"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { listAudit, type AuditAction, type AuditRow } from "@/lib/audit";

const ACTIONS: AuditAction[] = [
  "LOGIN_SUCCESS", "LOGIN_FAILURE", "LOGOUT",
  "USER_CREATED", "USER_UPDATED", "USER_DELETED",
  "ROLE_CHANGED", "ROLE_OVERRIDE_CHANGED",
  "API_KEY_CREATED", "API_KEY_REVOKED",
  "RESOURCE_DELETED", "DATA_RETENTION_PURGE",
];

const ACTION_TONE: Record<AuditAction, "completed" | "cancelled" | "draft" | "pending" | "progress" | "partial"> = {
  LOGIN_SUCCESS: "completed",
  LOGIN_FAILURE: "cancelled",
  LOGOUT: "draft",
  USER_CREATED: "progress",
  USER_UPDATED: "pending",
  USER_DELETED: "cancelled",
  ROLE_CHANGED: "progress",
  ROLE_OVERRIDE_CHANGED: "progress",
  API_KEY_CREATED: "progress",
  API_KEY_REVOKED: "cancelled",
  RESOURCE_DELETED: "cancelled",
  DATA_RETENTION_PURGE: "partial",
};

export function AuditAdminPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [action, setAction] = useState<AuditAction | "__all__">("__all__");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setRows(await listAudit({
        action: action === "__all__" ? undefined : action,
        from: from || undefined,
        to: to || undefined,
        take: 500,
      }));
    } catch (e: any) { setError(e?.message ?? "Load failed."); }
  };
  useEffect(() => { void load(); }, [action, from, to]);

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Audit Log</h2>
        <p className="text-sm text-slate-500">
          Append-only log of authentication events, role changes, deletes, and retention purges. Manage retention from <span className="font-mono">Settings → Data Retention</span>.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs font-medium text-slate-600">Action</label>
          <Select value={action} onValueChange={(v) => setAction(v as any)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All actions</SelectItem>
              {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
        </div>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-3">When</th>
              <th className="py-2 pr-3">Actor</th>
              <th className="py-2 pr-3">Action</th>
              <th className="py-2 pr-3">Target</th>
              <th className="py-2 pr-3">IP</th>
              <th className="py-2 pr-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td className="py-4 text-slate-400" colSpan={6}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="py-4 text-slate-400" colSpan={6}>No entries.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="py-2 pr-3 text-slate-700">{r.actor?.displayName ?? <span className="text-slate-400">—</span>}<div className="font-mono text-xs text-slate-400">{r.actor?.username ?? ""}</div></td>
                <td className="py-2 pr-3"><Badge tone={ACTION_TONE[r.action]}>{r.action}</Badge></td>
                <td className="py-2 pr-3 text-slate-600">{r.targetType ?? "—"}{r.targetId ? <span className="font-mono text-xs text-slate-400"> / {r.targetId}</span> : null}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{r.ipAddress ?? "—"}</td>
                <td className="py-2 pr-3 max-w-md break-all text-xs text-slate-500">
                  {r.metadata ? <code>{JSON.stringify(r.metadata)}</code> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
