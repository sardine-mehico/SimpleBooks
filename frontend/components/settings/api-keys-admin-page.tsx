"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Copy } from "lucide-react";
import { listApiKeys, createApiKey, revokeApiKey, type ApiKeyRow } from "@/lib/api-keys";
import { listUsers, type UserRow } from "@/lib/users";

export function ApiKeysAdminPage() {
  const [rows, setRows] = useState<ApiKeyRow[] | null>(null);
  const [apiUsers, setApiUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSecret, setNewSecret] = useState<{ label: string; secret: string } | null>(null);

  const refresh = async () => {
    try {
      const [keys, users] = await Promise.all([listApiKeys(), listUsers()]);
      setRows(keys);
      setApiUsers(users.filter((u) => u.role === "API_USER" && u.isActive));
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    }
  };
  useEffect(() => { void refresh(); }, []);

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">API Keys</h2>
          <p className="text-sm text-slate-500">
            Bearer tokens for programmatic access. Each key belongs to an <strong>API_USER</strong> account.
            Create an API user first via the Users page, then issue a key here.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={apiUsers.length === 0}>
          <Plus className="h-4 w-4" /> New API key
        </Button>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {apiUsers.length === 0 ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No active API_USER accounts exist. Create one in Settings → Users first.
        </div>
      ) : null}
      <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-100">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="bg-white py-2 px-3">Label</th>
              <th className="bg-white py-2 px-3">User</th>
              <th className="bg-white py-2 px-3">Key</th>
              <th className="bg-white py-2 px-3">Last used</th>
              <th className="bg-white py-2 px-3">Status</th>
              <th className="bg-white py-2 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td className="py-4 text-slate-400" colSpan={6}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="py-4 text-slate-400" colSpan={6}>No API keys yet.</td></tr>
            ) : rows.map((k) => (
              <tr key={k.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 text-slate-900">{k.label}</td>
                <td className="py-2 pr-3 text-slate-700">{k.user.displayName} <span className="font-mono text-xs text-slate-400">({k.user.username})</span></td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{k.prefix}…{k.suffix}</td>
                <td className="py-2 pr-3 text-slate-500">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}</td>
                <td className="py-2 pr-3">{k.revokedAt ? <Badge tone="cancelled">Revoked</Badge> : <Badge tone="completed">Active</Badge>}</td>
                <td className="py-2 pr-3 text-right">
                  {!k.revokedAt ? (
                    <button className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700" title="Revoke" onClick={async () => { await revokeApiKey(k.id); refresh(); }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <CreateKeyDialog
          users={apiUsers}
          onClose={() => setCreateOpen(false)}
          onCreated={(secret, label) => { setNewSecret({ secret, label }); refresh(); }}
        />
      ) : null}
      {newSecret ? (
        <Dialog open onOpenChange={(o) => !o && setNewSecret(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Key created — copy now</DialogTitle>
              <DialogDescription>
                This is the only time this key will be shown. Save it somewhere safe; it cannot be recovered later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">{newSecret.label}</p>
              <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <code className="flex-1 break-all font-mono text-xs text-slate-800">{newSecret.secret}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(newSecret.secret)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setNewSecret(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Card>
  );
}

function CreateKeyDialog({
  users, onClose, onCreated,
}: {
  users: UserRow[];
  onClose: () => void;
  onCreated: (secret: string, label: string) => void;
}) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await createApiKey({
        userId, label,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      onCreated(res.secret, res.label);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Create failed.");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New API key</DialogTitle>
          <DialogDescription>Bearer key for programmatic access.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">User</label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.displayName} ({u.username})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Label</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="e.g. Zapier integration" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Expires at (optional)</label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          {err ? <p className="text-sm text-rose-600">{err}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
