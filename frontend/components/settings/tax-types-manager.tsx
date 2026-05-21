"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SectionHeader } from "./section-header";
import { apiClient } from "@/lib/api";
import type { TaxType } from "@/lib/types";

type FormState = {
  name: string;
  rate: string;
  description: string;
  isActive: boolean;
};

const blank: FormState = { name: "", rate: "0", description: "", isActive: true };

export function TaxTypesManager({ initial }: { initial: TaxType[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaxType | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setEditing(null);
    setForm(blank);
    setError(null);
    setOpen(true);
  }

  function startEdit(row: TaxType) {
    setEditing(row);
    setForm({
      name: row.name,
      rate: String(row.rate),
      description: row.description ?? "",
      isActive: row.isActive,
    });
    setError(null);
    setOpen(true);
  }

  async function refresh() {
    const next = await apiClient.get<TaxType[]>("/tax-types");
    setRows(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      rate: Number(form.rate),
      // Send null (not undefined) so clearing the field on an existing row
      // actually nulls the column. `undefined` would be omitted from JSON,
      // and Prisma's update() treats missing keys as "leave unchanged".
      description: form.description || null,
      isActive: form.isActive,
    };
    try {
      if (editing) await apiClient.patch(`/tax-types/${editing.id}`, payload);
      else await apiClient.post("/tax-types", payload);
      setOpen(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: TaxType) {
    if (!confirm(`Delete tax type "${row.name}"?`)) return;
    await apiClient.delete(`/tax-types/${row.id}`);
    setRows((r) => r.filter((x) => x.id !== row.id));
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <SectionHeader title="Tax Types" description="Configure tax rates available for line items. Active types appear at the top." />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={startCreate}>
              <Plus className="h-4 w-4" />
              New tax type
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.name}` : "New tax type"}</DialogTitle>
              <DialogDescription>
                Active types appear first in the list and can be applied to invoice line items.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="flex flex-col gap-3">
              <Field label="Tax Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="GST"
                  autoFocus
                  required
                />
              </Field>
              <Field label="Rate %" required>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  max="100"
                  value={form.rate}
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Description">
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="min-h-0"
                />
              </Field>
              <Field label="Active">
                <div className="flex h-9 items-center">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  />
                </div>
              </Field>
              {error ? <p className="text-xs text-rose-600">{error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_2fr_100px_80px] items-center gap-x-4 border-b border-slate-100 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
          <div>Name</div>
          <div className="text-right">Rate</div>
          <div>Description</div>
          <div className="text-center">Status</div>
          <div />
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-slate-400">
              No tax types yet — add one to get started.
            </li>
          )}
          {rows.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[1fr_100px_2fr_100px_80px] items-center gap-x-4 px-5 py-3 text-sm"
            >
              <span className="font-medium text-slate-900">{r.name}</span>
              <span className="text-right tabular-nums text-slate-900">{Number(r.rate)}%</span>
              <span className="truncate text-slate-500">{r.description ?? "—"}</span>
              <div className="flex justify-center">
                <Badge tone={r.isActive ? "completed" : "cancelled"}>
                  {r.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => startEdit(r)}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(r)}
                  className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
