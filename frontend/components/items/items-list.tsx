"use client";

import { Badge } from "@/components/ui/badge";
import {
  FilteredList,
  textIncludes,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import type { Item } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const columns: Column<Item>[] = [
  { key: "name", label: "Name", render: (r) => <span className="font-medium text-slate-900">{r.name}</span>, width: "1.5fr", sortValue: (r) => r.name },
  { key: "desc", label: "Description", render: (r) => <span className="text-slate-600">{r.description ?? "—"}</span>, width: "2fr", sortValue: (r) => r.description ?? "" },
  { key: "price", label: "Unit Price", align: "right", render: (r) => formatCurrency(Number(r.unitPrice)), width: "150px", sortValue: (r) => Number(r.unitPrice) },
  { key: "status", label: "Status", align: "center", render: (r) => <Badge tone={r.isActive ? "completed" : "cancelled"}>{r.isActive ? "Active" : "Inactive"}</Badge>, width: "120px", sortValue: (r) => r.isActive },
];

const filterFields: FilterFieldDef[] = [
  { key: "name", label: "Name", type: "text", placeholder: "Search by name…" },
  { key: "desc", label: "Description", type: "text", placeholder: "Search description…" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
];

export function ItemsList({ initial }: { initial: Item[] }) {
  return (
    <FilteredList<Item>
      title="Items"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/items/${r.id}`}
      newHref="/items/new"
      newLabel="New item"
      emptyMessage="No items yet — create one to start."
      filterFields={filterFields}
      filterFn={(r, v) =>
        textIncludes(r.name, v.name ?? "") &&
        textIncludes(r.description, v.desc ?? "") &&
        (!v.status || v.status === "__all__"
          ? true
          : v.status === "active"
            ? r.isActive
            : !r.isActive)
      }
      defaultSort={{ key: "status", direction: "asc" }}
      tieBreakerKey="name"
    />
  );
}
