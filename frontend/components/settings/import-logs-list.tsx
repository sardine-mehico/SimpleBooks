"use client";

import { useMemo } from "react";
import {
  FilteredList,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import type { Account, ImportLogSummary } from "@/lib/types";

const columns: Column<ImportLogSummary>[] = [
  {
    key: "importedAt",
    label: "Imported",
    render: (r) => <span className="text-slate-700">{new Date(r.importedAt).toLocaleString("en-AU")}</span>,
    width: "180px",
    sortValue: (r) => new Date(r.importedAt),
  },
  {
    key: "account",
    label: "Account",
    render: (r) => <span className="font-medium text-slate-900">{r.account.name}</span>,
    width: "1fr",
    sortValue: (r) => r.account.name,
  },
  {
    key: "filename",
    label: "File",
    render: (r) => <span className="font-mono text-xs text-slate-600">{r.filename}</span>,
    width: "1.5fr",
    sortValue: (r) => r.filename,
  },
  { key: "rowsTotal", label: "Total", align: "right", render: (r) => <span className="tabular-nums">{r.rowsTotal}</span>, width: "70px", sortValue: (r) => r.rowsTotal },
  { key: "rowsImported", label: "Imported", align: "right", render: (r) => <span className="tabular-nums text-emerald-700">{r.rowsImported}</span>, width: "80px", sortValue: (r) => r.rowsImported },
  { key: "rowsSkippedDup", label: "Dupes", align: "right", render: (r) => <span className="tabular-nums text-amber-700">{r.rowsSkippedDup}</span>, width: "70px", sortValue: (r) => r.rowsSkippedDup },
  { key: "rowsFailed", label: "Failed", align: "right", render: (r) => <span className="tabular-nums text-red-700">{r.rowsFailed}</span>, width: "70px", sortValue: (r) => r.rowsFailed },
];

export function ImportLogsList({ initial, accounts }: { initial: ImportLogSummary[]; accounts: Account[] }) {
  const filterFields: FilterFieldDef[] = useMemo(
    () => [
      {
        key: "account",
        label: "Account",
        type: "select",
        options: accounts.map((a) => ({ value: a.id, label: a.name })),
      },
    ],
    [accounts],
  );
  return (
    <FilteredList<ImportLogSummary>
      title="Import Logs"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/settings/import-logs/${r.id}`}
      emptyMessage="No imports yet."
      filterFields={filterFields}
      filterFn={(r, v) => selectMatches(r.accountId, v.account ?? "")}
      defaultSort={{ key: "importedAt", direction: "desc" }}
      tieBreakerKey="account"
    />
  );
}
