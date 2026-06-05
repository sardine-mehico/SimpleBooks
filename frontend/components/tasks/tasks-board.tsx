"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Filter, Plus, Trash2, Check } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FilterPanel,
  countActive,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filter-panel";
import { Pagination } from "@/components/data/pagination";
import { DEFAULT_PAGE_SIZE } from "@/components/data/list-table";
import Link from "next/link";
import { cn, formatAuditStamp } from "@/lib/utils";

// Status priority for the default Tasks ordering: pending first, then in-progress,
// then completed at the bottom, then cancelled.
const STATUS_ORDER: Record<Status, number> = {
  PENDING: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

type Status = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: Status;
  createdAt: string;
  completedAt?: string | null;
};

const STATUS_TONE: Record<Status, "pending" | "progress" | "completed" | "cancelled"> = {
  PENDING: "pending",
  IN_PROGRESS: "progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const filterFields: FilterFieldDef[] = [
  { key: "title", label: "Title", type: "text", placeholder: "Search by title…" },
  { key: "description", label: "Description", type: "text", placeholder: "Search description…" },
  { key: "createdFrom", label: "Created from", type: "date" },
  { key: "createdTo", label: "Created to", type: "date" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: (["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as Status[]).map((s) => ({
      value: s,
      label: STATUS_LABEL[s],
    })),
  },
];

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function TasksBoard({ initial }: { initial: Task[] }) {
  const [tasks, setTasks] = useState(initial);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("PENDING");
  const [createError, setCreateError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const activeCount = useMemo(() => countActive(filters), [filters]);
  const filtered = useMemo(() => {
    // Date filters compare against the start-of-day of the createdAt timestamp.
    const fromTs = filters.createdFrom ? new Date(filters.createdFrom + "T00:00:00").getTime() : null;
    const toTs = filters.createdTo ? new Date(filters.createdTo + "T23:59:59.999").getTime() : null;
    const base = activeCount === 0
      ? tasks
      : tasks.filter((t) => {
          const created = new Date(t.createdAt).getTime();
          return (
            textIncludes(t.title, filters.title ?? "") &&
            textIncludes(t.description, filters.description ?? "") &&
            selectMatches(t.status, filters.status ?? "") &&
            (fromTs == null || created >= fromTs) &&
            (toTs == null || created <= toTs)
          );
        });
    // Default sort: status priority, then newest first within each bucket.
    return [...base].sort((a, b) => {
      const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (order !== 0) return order;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [tasks, filters, activeCount]);

  const [page, setPage] = useState(0);
  const pageSize = DEFAULT_PAGE_SIZE;
  const paginated = useMemo(
    () => filtered.slice(page * pageSize, (page + 1) * pageSize),
    [filtered, page, pageSize],
  );
  // Reset to first page on filter change.
  useEffect(() => { setPage(0); }, [filters]);

  async function refresh() {
    const res = await fetch(`${API}/tasks`, { cache: "no-store" });
    if (res.ok) setTasks(await res.json());
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!title.trim()) {
      setCreateError("Title is required.");
      return;
    }
    const res = await fetch(`${API}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, description: description || undefined, status }),
    });
    if (res.ok) {
      setTitle("");
      setDescription("");
      setStatus("PENDING");
      setDialogOpen(false);
      startTransition(refresh);
      return;
    }
    const body = await res.text().catch(() => "");
    let msg = `Save failed (HTTP ${res.status}).`;
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed?.message)) msg = parsed.message.join(". ");
      else if (typeof parsed?.message === "string") msg = parsed.message;
    } catch {}
    setCreateError(msg);
  }

  async function removeTask(id: string) {
    await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
    setTasks((t) => t.filter((x) => x.id !== id));
  }

  async function toggleComplete(t: Task) {
    const next: Status = t.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    await fetch(`${API}/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setTasks((tasks) => tasks.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
  }

  return (
    <PageShell
      title="Tasks"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilterOpen((o) => !o)}
            className={cn(filterOpen && "border-indigo-300 bg-indigo-50/40")}
          >
            <Filter className="h-4 w-4" />
            Filter
            {activeCount > 0 && (
              <span className="ml-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                {activeCount}
              </span>
            )}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setCreateError(null); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                New task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create task</DialogTitle>
                <DialogDescription>Track work that needs attention.</DialogDescription>
              </DialogHeader>
              <form onSubmit={createTask} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Title</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reconcile bank statement" autoFocus />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Description (optional)</label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything else to note" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Status</label>
                  <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as Status[]).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {createError ? (
                  <p className="text-xs text-rose-600" role="alert">{createError}</p>
                ) : null}
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Create</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      {filterOpen && (
        <FilterPanel
          fields={filterFields}
          values={filters}
          onChange={(k, v) => setFilters((s) => ({ ...s, [k]: v }))}
          onClose={() => setFilterOpen(false)}
          onClear={() => setFilters({})}
          activeCount={activeCount}
        />
      )}

      <Card className="flex max-h-[calc(100vh-12rem)] flex-col overflow-hidden">
        <div className="flex w-full flex-1 flex-col overflow-x-auto overflow-y-hidden md:overflow-visible">
        <div className="flex min-w-[700px] flex-1 flex-col md:min-w-0">
        <div className="grid shrink-0 grid-cols-[auto_1fr_120px_140px_140px_auto] items-center gap-x-4 border-b border-slate-100 bg-[#b6bacb] px-5 py-2.5 text-[12px] font-medium uppercase tracking-wider text-white">
          <div className="w-4" />
          <div>Task</div>
          <div>Status</div>
          <div>Created at</div>
          <div>Completed at</div>
          <div />
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-slate-400">
              {activeCount > 0 ? "No tasks match the current filters." : "No tasks yet — create one to get started."}
            </li>
          )}
          {paginated.map((t) => (
            <li key={t.id} className="grid grid-cols-[auto_1fr_120px_140px_140px_auto] items-center gap-x-4 px-5 py-3 hover:bg-slate-50/80 transition-colors">
              <button
                onClick={() => toggleComplete(t)}
                className={`grid h-5 w-5 place-items-center rounded border ${
                  t.status === "COMPLETED"
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-300 bg-white text-transparent hover:border-indigo-500"
                }`}
                aria-label="Toggle complete"
              >
                <Check className="h-3 w-3" />
              </button>
              <Link href={`/tasks/${t.id}`} className="min-w-0 cursor-pointer">
                <div className={`truncate text-sm font-medium ${t.status === "COMPLETED" ? "text-slate-400 line-through" : "text-slate-900"}`}>
                  {t.title}
                </div>
                {t.description ? (
                  <div className="truncate text-xs text-slate-500">{t.description}</div>
                ) : null}
              </Link>
              <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              <span className="truncate text-xs text-slate-600 tabular-nums">{formatAuditStamp(t.createdAt)}</span>
              <span className="truncate text-xs text-slate-600 tabular-nums">{formatAuditStamp(t.completedAt)}</span>
              <button
                onClick={() => removeTask(t.id)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        </div>
        </div>
        <Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} />
      </Card>
    </PageShell>
  );
}
