"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getRolesMatrix, setRoleOverride } from "@/lib/roles";
import { ALL_CAPABILITIES, type Capability } from "@/lib/capabilities";
import type { UserRole } from "@/lib/users";

const ROLES: UserRole[] = ["ADMIN", "ACCOUNTANT", "BOOKKEEPER", "API_USER"];

// Group the capability list by prefix for readability.
const GROUPS: { label: string; prefix: string }[] = [
  { label: "Navigation", prefix: "nav." },
  { label: "Settings sections", prefix: "settings." },
  { label: "Actions", prefix: "action." },
];

export function RolesAdminPage() {
  const [matrix, setMatrix] = useState<Record<UserRole, Record<Capability, boolean>> | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { setMatrix((await getRolesMatrix()).matrix); } catch (e: any) { setError(e?.message ?? "Load failed."); }
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (role: UserRole, capability: Capability, allowed: boolean) => {
    if (role === "ADMIN") return; // ADMIN is locked-true server-side.
    setSaving(`${role}/${capability}`); setError(null);
    // Optimistic update.
    setMatrix((prev) => prev ? { ...prev, [role]: { ...prev[role], [capability]: allowed } } : prev);
    try {
      await setRoleOverride(role, capability, allowed);
    } catch (e: any) {
      setError(e?.message ?? "Save failed.");
      // Revert.
      await load();
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Roles</h2>
        <p className="text-sm text-slate-500">
          Per-role capability matrix. Flipping a switch updates the role globally — affected users see the change within ~1 minute.
          The ADMIN column is locked: admins always retain every capability.
        </p>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {matrix === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          {GROUPS.map((g) => {
            const caps = ALL_CAPABILITIES.filter((c) => c.startsWith(g.prefix));
            return (
              <div key={g.prefix} className="mb-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</h3>
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Capability</th>
                      {ROLES.map((r) => <th key={r} className="py-2 px-2 text-center">{r}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {caps.map((cap) => (
                      <tr key={cap} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-mono text-xs text-slate-700">{cap}</td>
                        {ROLES.map((r) => (
                          <td key={r} className="py-2 px-2 text-center">
                            <Switch
                              checked={matrix[r][cap]}
                              onCheckedChange={(v) => toggle(r, cap, v)}
                              disabled={r === "ADMIN" || saving === `${r}/${cap}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
