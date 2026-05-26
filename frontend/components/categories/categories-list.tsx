"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FilteredList,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import { CATEGORY_KINDS, type Category, type Customer } from "@/lib/types";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { deleteCategory, splitCategory } from "@/lib/banking-rules";

// A row in the tree-flattened list carries its depth so the Name cell can indent.
type TreeRow = Category & { _depth: 0 | 1 };

export function CategoriesList({ initial, customers }: { initial: Category[]; customers: Customer[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitial, setDialogInitial] = useState<Category | undefined>(undefined);
  const [dialogDefaultParent, setDialogDefaultParent] = useState<string | null>(null);

  // Flatten categories into tree order: each parent followed by its children,
  // sorted by sortOrder then name within each band. Children with a missing
  // parent (data anomaly) fall through to the bottom as if they were top-level.
  const { treeRows, topLevel } = useMemo(() => {
    const byId = new Map(initial.map((c) => [c.id, c]));
    const top = initial
      .filter((c) => !c.parentId || !byId.has(c.parentId))
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const childrenByParent = new Map<string, Category[]>();
    for (const c of initial) {
      if (c.parentId && byId.has(c.parentId)) {
        const arr = childrenByParent.get(c.parentId) ?? [];
        arr.push(c);
        childrenByParent.set(c.parentId, arr);
      }
    }
    for (const arr of childrenByParent.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    const flat: TreeRow[] = [];
    for (const p of top) {
      flat.push({ ...p, _depth: 0 });
      for (const c of childrenByParent.get(p.id) ?? []) {
        flat.push({ ...c, _depth: 1 });
      }
    }
    return { treeRows: flat, topLevel: top };
  }, [initial]);

  function openAdd() {
    setDialogInitial(undefined);
    setDialogDefaultParent(null);
    setDialogOpen(true);
  }

  function openEdit(row: Category) {
    setDialogInitial(row);
    setDialogDefaultParent(row.parentId);
    setDialogOpen(true);
  }

  async function openSub(row: Category) {
    // Leaves with existing transactions need a "(general)" child to absorb them
    // before they can host a real subcategory; splitCategory is idempotent.
    if ((row._count?.transactions ?? 0) > 0) {
      try {
        await splitCategory(row.id);
      } catch (e) {
        // If split fails, surface and bail so we don't leave the user in a broken state.
        // eslint-disable-next-line no-alert
        alert((e as Error)?.message ?? "Failed to prepare subcategory");
        return;
      }
    }
    setDialogInitial(undefined);
    setDialogDefaultParent(row.id);
    setDialogOpen(true);
  }

  async function onDelete(row: Category) {
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    try {
      await deleteCategory(row.id);
      router.refresh();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert((e as Error)?.message ?? "Delete failed");
    }
  }

  const columns: Column<TreeRow>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Name",
        render: (r) => (
          <button
            type="button"
            onClick={() => openEdit(r)}
            className="truncate text-left font-medium text-slate-900 hover:text-indigo-700"
            style={{ paddingLeft: r._depth === 1 ? "1.75rem" : 0 }}
          >
            {r._depth === 1 ? <span className="text-slate-400">└ </span> : null}
            {r.name}
          </button>
        ),
        width: "2fr",
      },
      {
        key: "kind",
        label: "Kind",
        render: (r) => {
          const tone = CATEGORY_KINDS.find((k) => k.value === r.kind)?.tone ?? "bg-slate-100";
          return <span className={`inline-block rounded-[0.3rem] px-2 py-0.5 text-xs ${tone}`}>{r.kind}</span>;
        },
        width: "120px",
      },
      {
        key: "sort",
        label: "Sort",
        align: "right",
        render: (r) => <span className="tabular-nums text-slate-500">{r.sortOrder}</span>,
        width: "80px",
      },
      {
        key: "txns",
        label: "Used by",
        align: "right",
        render: (r) => <span className="tabular-nums text-slate-500">{r._count?.transactions ?? 0}</span>,
        width: "100px",
      },
      {
        key: "status",
        label: "Status",
        align: "center",
        render: (r) => <Badge tone={r.isActive ? "completed" : "cancelled"}>{r.isActive ? "Active" : "Inactive"}</Badge>,
        width: "100px",
      },
      {
        key: "actions",
        label: "",
        align: "right",
        render: (r) => (
          <div className="flex items-center justify-end gap-1">
            {r._depth === 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => openSub(r)} title="Add subcategory">
                <Plus className="h-3.5 w-3.5" /> Sub
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(r)} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(r)} title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
        width: "200px",
      },
    ],
    // openAdd/openEdit/openSub/onDelete are stable enough for our purposes — refs
    // are captured fresh on every render via the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const filterFields: FilterFieldDef[] = useMemo(
    () => [
      { key: "name", label: "Name", type: "text", placeholder: "Search by name…" },
      {
        key: "kind",
        label: "Kind",
        type: "select",
        options: CATEGORY_KINDS.map((k) => ({ value: k.value, label: k.label })),
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    ],
    [],
  );

  return (
    <>
      <FilteredList<TreeRow>
        title="Categories"
        rows={treeRows}
        columns={columns}
        newHref="/categories/new"
        newLabel="New category"
        emptyMessage="No categories yet."
        filterFields={filterFields}
        filterFn={(r, v) =>
          textIncludes(r.name, v.name ?? "") &&
          selectMatches(r.kind, v.kind ?? "") &&
          (!v.status || v.status === "__all__"
            ? true
            : v.status === "active" ? r.isActive : !r.isActive)
        }
      />
      {/* Keyed remount: CategoryFormDialog seeds its form state from props via
          useState initializers, so we force a fresh mount each time the intent
          changes (add-top, add-sub-of-X, edit-Y). Without this the parent
          dropdown sticks at whatever the first open chose. */}
      <CategoryFormDialog
        key={
          dialogOpen
            ? `${dialogInitial?.id ?? "new"}|${dialogDefaultParent ?? "top"}`
            : "closed"
        }
        open={dialogOpen}
        initial={dialogInitial}
        defaultParentId={dialogDefaultParent}
        parents={topLevel}
        customers={customers}
        onClose={() => {
          setDialogOpen(false);
          setDialogInitial(undefined);
          setDialogDefaultParent(null);
        }}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
