"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
import { createTag, updateTag } from "@/lib/banking-rules";
import { sortActiveFirst, labelForOption } from "@/lib/sort-selectable";
import type { Customer, Tag } from "@/lib/types";

export function TagFormDialog({
  tag,
  customers,
  onClose,
  onSaved,
}: {
  tag?: Tag;
  customers: Customer[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!tag;
  const [name, setName] = useState(tag?.name ?? "");
  const [aliases, setAliases] = useState<string[]>(tag?.aliases ?? []);
  const [aliasDraft, setAliasDraft] = useState("");
  const [color, setColor] = useState(tag?.color ?? "");
  const [notes, setNotes] = useState(tag?.notes ?? "");
  const [isActive, setIsActive] = useState(tag?.isActive ?? true);
  const [customerId, setCustomerId] = useState<string>(tag?.customerId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addAlias() {
    const t = aliasDraft.trim();
    if (!t) return;
    if (aliases.includes(t)) { setAliasDraft(""); return; }
    setAliases([...aliases, t]);
    setAliasDraft("");
  }
  function removeAlias(a: string) {
    setAliases(aliases.filter((x) => x !== a));
  }
  function onAliasKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addAlias();
    }
  }

  async function onSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        aliases,
        color: color.trim() || undefined,
        notes: notes.trim() || undefined,
        isActive,
        customerId: customerId || null,
      };
      if (isEdit) await updateTag(tag!.id, payload);
      else await createTag(payload);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit tag: ${tag!.name}` : "New tag"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Honda CRV 2006" autoFocus />
          </Field>

          <Field label="Aliases (description fragments that auto-apply this tag)">
            <div className="rounded-[0.3rem] border border-slate-300 bg-white p-2">
              <div className="flex flex-wrap gap-1">
                {aliases.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {a}
                    <button type="button" onClick={() => removeAlias(a)} className="text-slate-400 hover:text-slate-700" aria-label={`Remove alias ${a}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={aliasDraft}
                  onChange={(e) => setAliasDraft(e.target.value)}
                  onKeyDown={onAliasKeyDown}
                  onBlur={addAlias}
                  placeholder={aliases.length === 0 ? "Type a fragment and press Enter…" : "Add another…"}
                  className="flex-1 min-w-[120px] border-0 bg-transparent text-xs focus:outline-none"
                />
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                Aliases are matched case-insensitively against the transaction description. Word-boundary aware, longest pattern wins.
              </div>
            </div>
          </Field>

          <Field label="Linked customer (optional)">
            <Select value={customerId || "__none__"} onValueChange={(v) => setCustomerId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— none —</SelectItem>
                {sortActiveFirst(customers).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{labelForOption(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-1 text-[10px] text-slate-500">
              When set, transactions with this tag are scored against this customer's open invoices in Payments.
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Badge color (optional)">
              <Input value={color} onChange={(e) => setColor(e.target.value)} maxLength={32} placeholder="#a78bfa or tailwind token" />
            </Field>
            <Field label="Status">
              <label className="flex items-center gap-2 pt-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active (auto-alias matches and shows in dropdowns)
              </label>
            </Field>
          </div>

          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
          </Field>

          {error && <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-900">{error}</div>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
