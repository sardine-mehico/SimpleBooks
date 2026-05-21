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
import type { BillingCompany, Customer } from "@/lib/types";

// Show only the first line of a multi-line address in the table.
function firstLine(s?: string | null) {
  if (!s) return "—";
  const trimmed = s.trim();
  if (!trimmed) return "—";
  return trimmed.split(/\r?\n/)[0];
}

const columns: Column<Customer>[] = [
  { key: "num", label: "#", render: (r) => <span className="font-mono text-xs text-slate-500 tabular-nums">{r.customerNumber}</span>, width: "80px", sortValue: (r) => r.customerNumber },
  { key: "name", label: "Customer Name", render: (r) => <span className="font-medium text-slate-900">{r.name}</span>, width: "1.5fr", sortValue: (r) => r.name },
  { key: "company", label: "Billing Co.", render: (r) => <span className="text-slate-600">{r.billingCompany?.name ?? "—"}</span>, width: "1fr", sortValue: (r) => r.billingCompany?.name ?? "" },
  { key: "address", label: "Address", render: (r) => <span className="text-slate-600">{firstLine(r.address)}</span>, width: "1.3fr", sortValue: (r) => r.address ?? "" },
  { key: "email", label: "Primary billing email", render: (r) => <span className="text-slate-600">{r.billingEmail1 ?? "—"}</span>, width: "1.5fr", sortValue: (r) => r.billingEmail1 ?? "" },
  { key: "status", label: "Status", align: "center", render: (r) => <Badge tone={r.isActive ? "completed" : "cancelled"}>{r.isActive ? "Active" : "Inactive"}</Badge>, width: "120px", sortValue: (r) => r.isActive },
];

export function CustomersList({ initial, companies }: { initial: Customer[]; companies: BillingCompany[] }) {
  const filterFields: FilterFieldDef[] = useMemo(
    () => [
      { key: "name", label: "Customer Name", type: "text", placeholder: "Search by name…" },
      { key: "email", label: "Email", type: "text", placeholder: "Search by email…" },
      {
        key: "company",
        label: "Billing Company",
        type: "select",
        options: companies.map((c) => ({ value: c.id, label: c.name })),
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
    [companies],
  );

  return (
    <FilteredList<Customer>
      title="Customers"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/customers/${r.id}`}
      newHref="/customers/new"
      newLabel="New customer"
      emptyMessage="No customers yet."
      filterFields={filterFields}
      filterFn={(r, v) =>
        textIncludes(r.name, v.name ?? "") &&
        textIncludes(r.billingEmail1, v.email ?? "") &&
        selectMatches(r.billingCompanyId, v.company ?? "") &&
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
