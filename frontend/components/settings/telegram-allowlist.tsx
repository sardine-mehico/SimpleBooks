"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import { listUsers, type UserRow } from "@/lib/users";

export type AllowlistEntry = {
  id: string;
  username: string;
  userId?: string | null;
  user?: { id: string; username: string; displayName: string; role: string; isActive: boolean } | null;
  botName?: string | null;
  botToken?: string | null;
  note?: string | null;
  createdAt: string;
};

export function TelegramAllowlist({ initial }: { initial: AllowlistEntry[] }) {
  const [rows, setRows] = useState(initial);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [open, setOpen] = useState(false);
  // `editingId` is the row being edited; null = create flow.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", userId: "", botName: "", botToken: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    listUsers().then((u) => setUsers(u.filter((x) => x.isActive))).catch(() => {});
  }, []);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function resetForm() {
    setForm({ username: "", userId: "", botName: "", botToken: "", note: "" });
    setEditingId(null);
    setError(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }
  function openEdit(row: AllowlistEntry) {
    setEditingId(row.id);
    setForm({
      username: row.username,
      userId: row.user?.id ?? row.userId ?? "",
      botName: row.botName ?? "",
      botToken: row.botToken ?? "",
      note: row.note ?? "",
    });
    setError(null);
    setOpen(true);
  }

  async function refresh() {
    const next = await apiClient.get<AllowlistEntry[]>("/telegram/allowlist");
    setRows(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        username: form.username.trim().replace(/^@/, ""),
        userId: form.userId,
        botName: form.botName.trim(),
        botToken: form.botToken.trim(),
        note: form.note.trim(),
      };
      if (editingId) {
        await apiClient.patch(`/telegram/allowlist/${editingId}`, payload);
      } else {
        await apiClient.post("/telegram/allowlist", {
          ...payload,
          // POST preserves the original semantics of omitting empty optionals.
          botName: payload.botName || undefined,
          botToken: payload.botToken || undefined,
          note: payload.note || undefined,
        });
      }
      resetForm();
      setOpen(false);
      startTransition(refresh);
    } catch (e: any) {
      setError(parseError(e?.message));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove from allowlist?")) return;
    await apiClient.delete(`/telegram/allowlist/${id}`);
    setRows((r) => r.filter((x) => x.id !== id));
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Allowlisted users</div>
          <p className="mt-1 text-xs text-slate-500">
            Only Telegram users on this list can issue commands to the bot. Each entry links a Telegram handle to a SimpleBooks user — the bot then runs every command subject to that user's role. The leading <code className="rounded bg-slate-100 px-1">@</code> is optional.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <strong>Tip:</strong> link your own Telegram handle to the admin user for full bot capability.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" />Add user</Button>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit allowlisted user" : "Add allowlisted user"}</DialogTitle>
              <DialogDescription>
                Bot Token is stored for reference only — the bot actually runs against{" "}
                <code className="rounded bg-slate-100 px-1">TELEGRAM_BOT_TOKEN</code> in <code>.env</code>.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="flex flex-col gap-3">
              <Field label="Telegram Username" required>
                <Input
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  placeholder="@johndoe"
                  autoFocus
                  required
                />
              </Field>
              <Field label="Linked SimpleBooks user" required hint="The bot will act as this user's role for every command from this Telegram handle.">
                <Select value={form.userId} onValueChange={(v) => update("userId", v)}>
                  <SelectTrigger><SelectValue placeholder="Pick a user…" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.displayName} ({u.username}) — {u.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Bot Name">
                <Input
                  value={form.botName}
                  onChange={(e) => update("botName", e.target.value)}
                  placeholder="SimpleBooks Bot"
                />
              </Field>
              <Field label="Bot Token" hint="Reference only — see banner above">
                <Input
                  value={form.botToken}
                  onChange={(e) => update("botToken", e.target.value)}
                  placeholder="123456:ABC-DEF…"
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Note (optional)">
                <Input
                  value={form.note}
                  onChange={(e) => update("note", e.target.value)}
                  placeholder="e.g. primary bookkeeper"
                />
              </Field>
              {error ? <p className="text-xs text-rose-600">{error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
                <Button type="submit" disabled={saving || !form.userId}>
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add user"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border-b border-slate-100 bg-amber-50/60 px-5 py-2 text-[11px] text-amber-800">
        <strong>Bot Token field is for reference only.</strong> The actual token must be set in your <code>.env</code> as{" "}
        <code className="rounded bg-white px-1">TELEGRAM_BOT_TOKEN</code>; whatever you store here is never used at runtime.
      </div>

      <div className="grid grid-cols-[160px_180px_140px_1fr_1fr_64px] items-center gap-x-4 border-b border-slate-100 px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <div>Username</div>
        <div>Linked user</div>
        <div>Bot Name</div>
        <div>Bot Token</div>
        <div>Note</div>
        <div />
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-slate-400">
            No users allowlisted yet. The bot will reject every command until you add at least one.
          </li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="grid grid-cols-[160px_180px_140px_1fr_1fr_64px] items-center gap-x-4 px-5 py-3 text-sm"
          >
            <span className="truncate font-mono text-slate-900">@{r.username}</span>
            <span className="truncate text-slate-700">
              {r.user ? (
                <>
                  {r.user.displayName} <span className="font-mono text-xs text-slate-400">· {r.user.role}</span>
                </>
              ) : (
                <span className="text-rose-600">unlinked — bot will reject</span>
              )}
            </span>
            <span className="truncate text-slate-700">{r.botName ?? "—"}</span>
            <span className="truncate font-mono text-xs text-slate-500" title={r.botToken ?? ""}>
              {r.botToken ?? "—"}
            </span>
            <span className="truncate text-xs text-slate-500">{r.note ?? "—"}</span>
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => openEdit(r)}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(r.id)}
                className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function parseError(msg?: string): string {
  if (!msg) return "Something went wrong";
  if (/409/.test(msg) || /Unique constraint/i.test(msg) || msg.includes("P2002")) return "That username is already on the list.";
  if (/400/.test(msg)) return "Pick a SimpleBooks user and use a valid username (3–32 letters / digits / underscore).";
  return msg;
}
