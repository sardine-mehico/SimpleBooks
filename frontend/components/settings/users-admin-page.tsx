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
import { Plus, KeyRound, Trash2 } from "lucide-react";
import { listUsers, createUser, updateUser, deleteUser, type UserRow, type UserRole } from "@/lib/users";

const ROLES: UserRole[] = ["ADMIN", "ACCOUNTANT", "BOOKKEEPER", "API_USER"];

export function UsersAdminPage() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [deleteUserRow, setDeleteUserRow] = useState<UserRow | null>(null);

  const refresh = async () => {
    try { setRows(await listUsers()); } catch (e: any) { setError(e?.message ?? "Load failed"); }
  };
  useEffect(() => { void refresh(); }, []);

  return (
    <Card className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Users</h2>
          <p className="text-sm text-slate-500">Create staff accounts and assign roles. Admin manages all credentials.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New user
        </Button>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-3">Username</th>
              <th className="py-2 pr-3">Display name</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Last login</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td className="py-4 text-slate-400" colSpan={6}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="py-4 text-slate-400" colSpan={6}>No users yet.</td></tr>
            ) : rows.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-mono text-slate-700">{u.username}</td>
                <td className="py-2 pr-3 text-slate-900">{u.displayName}</td>
                <td className="py-2 pr-3"><Badge tone="progress">{u.role}</Badge></td>
                <td className="py-2 pr-3">{u.isActive ? <Badge tone="completed">Active</Badge> : <Badge tone="cancelled">Inactive</Badge>}</td>
                <td className="py-2 pr-3 text-slate-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}</td>
                <td className="py-2 pr-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {u.role !== "API_USER" ? (
                      <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Reset password" onClick={() => setPwUser(u)}>
                        <KeyRound className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700" title="Delete" onClick={() => setDeleteUserRow(u)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen ? <CreateUserDialog onClose={() => setCreateOpen(false)} onCreated={refresh} /> : null}
      {pwUser ? <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} onChanged={refresh} /> : null}
      {deleteUserRow ? <DeleteDialog user={deleteUserRow} onClose={() => setDeleteUserRow(null)} onDeleted={refresh} /> : null}
    </Card>
  );
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("ACCOUNTANT");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await createUser({
        username: username.trim(),
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        role,
        password: role === "API_USER" ? undefined : password,
      });
      onCreated();
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
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>Admin creates accounts. Users cannot self-register or change their own password.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Username</label><Input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus /></div>
          <div><label className="text-xs font-medium text-slate-600">Display name</label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></div>
          <div><label className="text-xs font-medium text-slate-600">Email (optional)</label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div>
            <label className="text-xs font-medium text-slate-600">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {role !== "API_USER" ? (
            <div>
              <label className="text-xs font-medium text-slate-600">Initial password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
              <p className="mt-1 text-xs text-slate-500">Minimum 8 characters. Share securely with the user.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">API users authenticate via API key. Create the key from the API Keys settings page after this user is saved.</p>
          )}
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

function PasswordDialog({ user, onClose, onChanged }: { user: UserRow; onClose: () => void; onChanged: () => void }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await updateUser(user.id, { password });
      onChanged();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Update failed.");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password — {user.displayName}</DialogTitle>
          <DialogDescription>Set a new password for this user. Share it through a secure channel.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoFocus placeholder="New password" />
          {err ? <p className="text-sm text-rose-600">{err}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Set password"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ user, onClose, onDeleted }: { user: UserRow; onClose: () => void; onDeleted: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await deleteUser(user.id); onDeleted(); onClose(); } catch (e: any) { setErr(e?.message ?? "Delete failed."); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user?</DialogTitle>
          <DialogDescription>Remove <strong>{user.displayName}</strong> ({user.username}). This cannot be undone.</DialogDescription>
        </DialogHeader>
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={busy}>{busy ? "Deleting…" : "Delete"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
