"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Wand2 } from "lucide-react";
import { deleteTag, autoApplyAllTags, autoApplyOneTag } from "@/lib/banking-rules";
import type { Customer, Tag } from "@/lib/types";
import { TagFormDialog } from "./tag-form-dialog";

export function TagsList({ initial, customers }: { initial: Tag[]; customers: Customer[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Tag | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const filtered = query.trim()
    ? initial.filter((t) =>
        t.name.toLowerCase().includes(query.trim().toLowerCase())
        || t.aliases.some((a) => a.toLowerCase().includes(query.trim().toLowerCase())),
      )
    : initial;

  async function onDelete(t: Tag) {
    if (!confirm(`Delete tag "${t.name}"? Transactions tagged with it will lose the tag.`)) return;
    await deleteTag(t.id);
    router.refresh();
  }

  async function applyAll() {
    if (!confirm("Re-scan ALL transactions and apply matching tag aliases? This is idempotent — existing tag assignments stay.")) return;
    setBusy(true);
    setLastResult(null);
    try {
      const r = await autoApplyAllTags();
      setLastResult(`Scanned ${r.scanned} transactions · applied ${r.applied} new tag assignments.`);
    } finally {
      setBusy(false);
    }
  }

  async function applyOne(t: Tag) {
    setBusy(true);
    setLastResult(null);
    try {
      const r = await autoApplyOneTag(t.id);
      setLastResult(`"${t.name}": scanned ${r.scanned} · applied ${r.applied} new.`);
    } finally {
      setBusy(false);
    }
  }

  const customerName = new Map(customers.map((c) => [c.id, c.name]));

  return (
    <PageShell
      title="Tags"
      actions={
        <>
          <Button type="button" variant="outline" onClick={applyAll} disabled={busy}>
            <Wand2 className="h-4 w-4" /> Re-apply all to existing
          </Button>
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New tag
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
            placeholder="Search tags or aliases…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          {lastResult && (
            <span className="text-xs text-emerald-700">{lastResult}</span>
          )}
        </div>

        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[2fr_2fr_140px_120px_60px_120px] gap-3 bg-slate-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            <span>Name</span>
            <span>Aliases</span>
            <span>Linked customer</span>
            <span className="text-right">Transactions</span>
            <span className="text-center">Active</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-slate-400">No tags match.</li>
            )}
            {filtered.map((t) => (
              <li
                key={t.id}
                className="grid grid-cols-[2fr_2fr_140px_120px_60px_120px] items-center gap-3 px-4 py-2 text-sm"
              >
                <span className="font-medium text-slate-900">
                  {t.name}
                  {t.color && (
                    <span
                      aria-hidden
                      className="ml-2 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: t.color.startsWith("#") ? t.color : `#${t.color}` }}
                    />
                  )}
                </span>
                <span className="flex flex-wrap gap-1">
                  {t.aliases.length === 0 ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    t.aliases.map((a) => (
                      <code key={a} className="rounded bg-slate-100 px-1.5 py-0 text-[11px] text-slate-700">
                        {a}
                      </code>
                    ))
                  )}
                </span>
                <span className="text-xs text-slate-600">
                  {t.customerId ? (customerName.get(t.customerId) ?? "(missing)") : "—"}
                </span>
                <span className="text-right text-xs tabular-nums text-slate-600">
                  {t._count?.transactionTags ?? 0}
                </span>
                <span className="text-center text-xs">
                  {t.isActive ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">on</span>
                  ) : (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-600">off</span>
                  )}
                </span>
                <span className="flex justify-end gap-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => applyOne(t)} disabled={busy} aria-label={`Apply ${t.name} to existing transactions`}>
                    <Wand2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => onDelete(t)} aria-label={`Delete ${t.name}`}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {creating && (
        <TagFormDialog
          customers={customers}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); router.refresh(); }}
        />
      )}
      {editing && (
        <TagFormDialog
          tag={editing}
          customers={customers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </PageShell>
  );
}
