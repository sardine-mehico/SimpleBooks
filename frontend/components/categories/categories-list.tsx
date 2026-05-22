"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  FilteredList,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import { CATEGORY_KINDS, type Category } from "@/lib/types";

const columns: Column<Category>[] = [
  { key: "name", label: "Name", render: (r) => <span className="font-medium text-slate-900">{r.name}</span>, width: "2fr", sortValue: (r) => r.name },
  {
    key: "kind", label: "Kind",
    render: (r) => {
      const tone = CATEGORY_KINDS.find((k) => k.value === r.kind)?.tone ?? "bg-slate-100";
      return <span className={`inline-block rounded-[0.3rem] px-2 py-0.5 text-xs ${tone}`}>{r.kind}</span>;
    },
    width: "120px", sortValue: (r) => r.kind,
  },
  { key: "sort", label: "Sort", align: "right", render: (r) => <span className="tabular-nums text-slate-500">{r.sortOrder}</span>, width: "80px", sortValue: (r) => r.sortOrder },
  { key: "txns", label: "Used by", align: "right", render: (r) => <span className="tabular-nums text-slate-500">{r._count?.transactions ?? 0}</span>, width: "100px", sortValue: (r) => r._count?.transactions ?? 0 },
  { key: "status", label: "Status", align: "center", render: (r) => <Badge tone={r.isActive ? "completed" : "cancelled"}>{r.isActive ? "Active" : "Inactive"}</Badge>, width: "120px", sortValue: (r) => r.isActive },
];

export function CategoriesList({ initial }: { initial: Category[] }) {
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
    <FilteredList<Category>
      title="Categories"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/categories/${r.id}/edit`}
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
      defaultSort={{ key: "sort", direction: "asc" }}
      tieBreakerKey="name"
    />
  );
}
