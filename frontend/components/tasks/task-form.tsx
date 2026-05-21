"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/api-errors";
import { TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";
import { formatAuditStamp } from "@/lib/utils";

function toIsoDate(d?: string | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function TaskForm({ initial }: { initial: Task }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(initial.status);
  const [dueDate, setDueDate] = useState(toIsoDate(initial.dueDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiClient.patch(`/tasks/${initial.id}`, {
        title,
        description: description || undefined,
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      });
      router.push("/tasks");
      router.refresh();
    } catch (e: any) {
      setError(parseApiError(e?.message));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this task?")) return;
    await apiClient.delete(`/tasks/${initial.id}`);
    router.push("/tasks");
    router.refresh();
  }

  return (
    <EditPageChrome
      title={`Task · ${initial.title}`}
      backHref="/tasks"
      formId="task-form"
      saving={saving}
      rightActions={
        <Button type="button" variant="danger" size="icon" onClick={remove} aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    >
    <form id="task-form" onSubmit={submit}>
      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Title" required className="md:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Due Date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="min-h-[148px]"
            />
          </Field>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs md:grid-cols-2">
          <StampRow label="Created on" value={formatAuditStamp(initial.createdAt)} />
          <StampRow label="Started on" value={formatAuditStamp(initial.startedAt)} />
          <StampRow label="Completed on" value={formatAuditStamp(initial.completedAt)} />
          <StampRow label="Cancelled on" value={formatAuditStamp(initial.cancelledAt)} />
        </div>
        {error ? <p className="mt-3 text-xs text-rose-600" role="alert">{error}</p> : null}
      </Card>
    </form>
    </EditPageChrome>
  );
}

function StampRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-700">{value}</dd>
    </div>
  );
}
