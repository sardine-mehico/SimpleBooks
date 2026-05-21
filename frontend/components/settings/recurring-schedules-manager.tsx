"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { SectionHeader } from "./section-header";
import { apiClient } from "@/lib/api";
import {
  RECURRING_INTERVAL_UNITS,
  type RecurringIntervalUnit,
  type RecurringSchedule,
} from "@/lib/types";

export function RecurringSchedulesManager({ initial }: { initial: RecurringSchedule[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringSchedule | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<RecurringIntervalUnit>("MONTHS");
  const [count, setCount] = useState("1");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setName("");
    setUnit("MONTHS");
    setCount("1");
    setIsActive(true);
    setError(null);
    setOpen(true);
  }
  function openEdit(row: RecurringSchedule) {
    setEditing(row);
    setName(row.name);
    setUnit(row.intervalUnit);
    setCount(String(row.intervalCount));
    setIsActive(row.isActive);
    setError(null);
    setOpen(true);
  }
  function close() { setOpen(false); setError(null); }

  async function refresh() {
    setRows(await apiClient.get<RecurringSchedule[]>("/recurring-schedules"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = { name, intervalUnit: unit, intervalCount: Number(count) || 1, isActive };
    try {
      if (editing) await apiClient.patch(`/recurring-schedules/${editing.id}`, payload);
      else await apiClient.post("/recurring-schedules", payload);
      close();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Save failed.");
    }
  }

  async function remove(row: RecurringSchedule) {
    if (!confirm(`Delete schedule "${row.name}"?`)) return;
    await apiClient.delete(`/recurring-schedules/${row.id}`);
    await refresh();
  }

  // Sort: active first, then name asc.
  const sorted = [...rows].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <SectionHeader
        title="Recurring Schedules"
        description="Catalog of interval definitions. Used by recurring invoice templates."
      />
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-end">
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New schedule
          </Button>
        </div>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Interval</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-slate-900">{row.name}</td>
                  <td className="px-4 py-2 text-slate-700">
                    Every {row.intervalCount} {row.intervalUnit.toLowerCase()}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={row.isActive ? "completed" : "cancelled"}>
                      {row.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit schedule" : "New schedule"}</DialogTitle>
            <DialogDescription>
              Defines how often a recurring invoice generates. Used as the right-hand side of
              "Every &lt;count&gt; &lt;unit&gt;".
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Interval Count" required>
                <Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} required />
              </Field>
              <Field label="Interval Unit" required>
                <Select value={unit} onValueChange={(v) => setUnit(v as RecurringIntervalUnit)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRING_INTERVAL_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Active">
              <div className="flex h-9 items-center">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </Field>
            {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
