"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";

export type AllowlistEntry = {
  id: string;
  username: string;
  user?: string | null;
  botName?: string | null;
  botToken?: string | null;
  note?: string | null;
  createdAt: string;
};

export function TelegramAllowlist({ initial }: { initial: AllowlistEntry[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", user: "", botName: "", botToken: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetForm() {
    setForm({ username: "", user: "", botName: "", botToken: "", note: "" });
    setError(null);
  }

  async function refresh() {
    const next = await apiClient.get<AllowlistEntry[]>("/telegram/allowlist");
    setRows(next);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiClient.post("/telegram/allowlist", {
        username: form.username.trim().replace(/^@/, ""),
        user: form.user.trim() || undefined,
        botName: form.botName.trim() || undefined,
        botToken: form.botToken.trim() || undefined,
        note: form.note.trim() || undefined,
      });
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
            Only Telegram users on this list can issue commands to the bot. The leading <code className="rounded bg-slate-100 px-1">@</code> is optional.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4" />Add user</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add allowlisted user</DialogTitle>
              <DialogDescription>
                Only the Telegram username is required. Bot Token is stored for reference — the bot actually runs against{" "}
                <code className="rounded bg-slate-100 px-1">TELEGRAM_BOT_TOKEN</code> in <code>.env</code>.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={add} className="flex flex-col gap-3">
              <Field label="Telegram Username" required>
                <Input
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  placeholder="@johndoe"
                  autoFocus
                  required
                />
              </Field>
              <Field label="User" hint="Display name of the person">
                <Input
                  value={form.user}
                  onChange={(e) => update("user", e.target.value)}
                  placeholder="John Doe"
                />
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
                <Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add user"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border-b border-slate-100 bg-amber-50/60 px-5 py-2 text-[11px] text-amber-800">
        <strong>Bot Token field is for reference only.</strong> The actual token must be set in your <code>.env</code> as{" "}
        <code className="rounded bg-white px-1">TELEGRAM_BOT_TOKEN</code>; whatever you store here is never used at runtime.
      </div>

      <div className="grid grid-cols-[160px_140px_140px_1fr_1fr_40px] items-center gap-x-4 border-b border-slate-100 px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <div>Username</div>
        <div>User</div>
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
            className="grid grid-cols-[160px_140px_140px_1fr_1fr_40px] items-center gap-x-4 px-5 py-3 text-sm"
          >
            <span className="truncate font-mono text-slate-900">@{r.username}</span>
            <span className="truncate text-slate-700">{r.user ?? "—"}</span>
            <span className="truncate text-slate-700">{r.botName ?? "—"}</span>
            <span className="truncate font-mono text-xs text-slate-500" title={r.botToken ?? ""}>
              {r.botToken ?? "—"}
            </span>
            <span className="truncate text-xs text-slate-500">{r.note ?? "—"}</span>
            <button
              onClick={() => remove(r.id)}
              className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              aria-label="Remove"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function parseError(msg?: string): string {
  if (!msg) return "Something went wrong";
  if (/409/.test(msg) || /Unique constraint/i.test(msg) || msg.includes("P2002")) return "That username is already on the list.";
  if (/400/.test(msg)) return "Username must be 3–32 letters, digits, or underscores.";
  return msg;
}
