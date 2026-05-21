"use client";

import { Badge } from "@/components/ui/badge";
import {
  FilteredList,
  textIncludes,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import type { BillingCompany } from "@/lib/types";

// Show only the first line of multi-line addresses in the table.
function firstLine(s?: string | null) {
  if (!s) return "—";
  const trimmed = s.trim();
  if (!trimmed) return "—";
  return trimmed.split(/\r?\n/)[0];
}

const columns: Column<BillingCompany>[] = [
  {
    key: "name",
    label: "Company Name",
    render: (r) => <span className="font-medium text-slate-900">{r.name}</span>,
    width: "1.4fr",
    sortValue: (r) => r.name,
  },
  {
    key: "abn",
    label: "ABN",
    render: (r) => <span className="text-slate-600 tabular-nums">{r.abn ?? "—"}</span>,
    width: "160px",
    sortValue: (r) => r.abn ?? "",
  },
  {
    key: "email",
    label: "Accounts Email",
    render: (r) => <span className="text-slate-600">{r.accountsEmail ?? "—"}</span>,
    width: "1.3fr",
    sortValue: (r) => r.accountsEmail ?? "",
  },
  {
    key: "address",
    label: "Address",
    render: (r) => <span className="text-slate-600">{firstLine(r.address)}</span>,
    width: "1.3fr",
    sortValue: (r) => r.address ?? "",
  },
  {
    key: "status",
    label: "Status",
    align: "center",
    width: "120px",
    render: (r) => (
      <Badge tone={r.isActive ? "completed" : "cancelled"}>
        {r.isActive ? "Active" : "Inactive"}
      </Badge>
    ),
    sortValue: (r) => r.isActive,
  },
];

const filterFields: FilterFieldDef[] = [
  { key: "name", label: "Company Name", type: "text", placeholder: "Search by company name…" },
  { key: "abn", label: "ABN", type: "text", placeholder: "Search by ABN…" },
  { key: "address", label: "Address", type: "text", placeholder: "Search by address…" },
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

export function CompaniesList({ initial }: { initial: BillingCompany[] }) {
  return (
    <FilteredList<BillingCompany>
      title="Billing Companies"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/companies/${r.id}`}
      newHref="/companies/new"
      newLabel="New company"
      emptyMessage="No billing companies yet."
      filterFields={filterFields}
      filterFn={(r, v) =>
        textIncludes(r.name, v.name ?? "") &&
        textIncludes(r.abn, v.abn ?? "") &&
        textIncludes(r.address, v.address ?? "") &&
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
