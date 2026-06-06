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
import type { Account } from "@/lib/types";

const columns: Column<Account>[] = [
  {
    key: "name",
    label: "Account",
    render: (r) => <span className="font-medium text-slate-900">{r.name}</span>,
    width: "1.5fr",
    sortValue: (r) => r.name,
  },
  {
    key: "balance",
    label: "Current balance",
    align: "right",
    render: (r) => (
      <span className="font-mono tabular-nums text-slate-900">
        ${Number(r.currentBalance ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    ),
    width: "0.9fr",
    sortValue: (r) => Number(r.currentBalance ?? 0),
  },
  {
    key: "txns",
    label: "Transactions",
    align: "right",
    render: (r) => (
      <span className="font-mono tabular-nums text-slate-500">
        {r._count?.transactions ?? 0}
      </span>
    ),
    width: "0.7fr",
    sortValue: (r) => r._count?.transactions ?? 0,
  },
  {
    key: "bank",
    label: "Bank",
    render: (r) => <span className="text-slate-600">{r.bank}</span>,
    width: "1fr",
    sortValue: (r) => r.bank,
  },
  {
    key: "type",
    label: "Type",
    render: (r) => (
      <span
        className="text-slate-600"
        title={r.accountType?.description ?? undefined}
      >
        {r.accountType?.name ?? "—"}
      </span>
    ),
    width: "0.8fr",
    sortValue: (r) => r.accountType?.name ?? "",
  },
  {
    key: "status",
    label: "Status",
    align: "center",
    render: (r) => <Badge tone={r.isActive ? "completed" : "cancelled"}>{r.isActive ? "Active" : "Archived"}</Badge>,
    width: "120px",
    sortValue: (r) => r.isActive,
  },
];

export function AccountsList({ initial }: { initial: Account[] }) {
  const filterFields: FilterFieldDef[] = useMemo(
    () => [
      { key: "name", label: "Name", type: "text", placeholder: "Search by name…" },
      { key: "bank", label: "Bank", type: "text", placeholder: "Search by bank…" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ],
      },
    ],
    [],
  );

  return (
    <FilteredList<Account>
      title="Accounts"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/accounts/${r.id}`}
      newHref="/accounts/new"
      newLabel="New account"
      emptyMessage="No accounts yet."
      filterFields={filterFields}
      filterFn={(r, v) =>
        textIncludes(r.name, v.name ?? "") &&
        textIncludes(r.bank, v.bank ?? "") &&
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
