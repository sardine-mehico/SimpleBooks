"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FilteredList,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import { VENDOR_KINDS, type Vendor } from "@/lib/types";

const columns: Column<Vendor>[] = [
  { key: "name", label: "Vendor", render: (r) => <span className="font-medium text-slate-900">{r.name}</span>, width: "1.5fr", sortValue: (r) => r.name },
  { key: "kind", label: "Kind", render: (r) => <span className="text-slate-600">{r.kind}</span>, width: "100px", sortValue: (r) => r.kind },
  {
    key: "aliases", label: "Aliases",
    render: (r) => {
      const first = r.aliases.slice(0, 2);
      const remaining = r.aliases.length - first.length;
      return (
        <span className="text-xs text-slate-600">
          {first.map((a) => (
            <code key={a} className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5">{a}</code>
          ))}
          {remaining > 0 && <span className="text-slate-400">+{remaining} more</span>}
        </span>
      );
    },
    width: "2fr",
  },
  { key: "txns", label: "Used by", align: "right", render: (r) => <span className="tabular-nums text-slate-500">{r._count?.transactions ?? 0}</span>, width: "100px", sortValue: (r) => r._count?.transactions ?? 0 },
  { key: "status", label: "Status", align: "center", render: (r) => <Badge tone={r.isActive ? "completed" : "cancelled"}>{r.isActive ? "Active" : "Inactive"}</Badge>, width: "120px", sortValue: (r) => r.isActive },
];

export function VendorsList({ initial }: { initial: Vendor[] }) {
  const filterFields: FilterFieldDef[] = useMemo(
    () => [
      { key: "name", label: "Name", type: "text", placeholder: "Search by name…" },
      { key: "kind", label: "Kind", type: "select", options: VENDOR_KINDS.map((k) => ({ value: k.value, label: k.label })) },
    ],
    [],
  );

  return (
    <div>
      {/* Wizard shortcut above the list. If FilteredList exposes a headerExtras prop, use that instead. */}
      <div className="mb-3 flex justify-end">
        <Button asChild variant="outline">
          <Link href="/vendors/extract">Suggest vendors from transactions</Link>
        </Button>
      </div>
      <FilteredList<Vendor>
        title="Vendors"
        rows={initial}
        columns={columns}
        rowHref={(r) => `/vendors/${r.id}/edit`}
        newHref="/vendors/new"
        newLabel="New vendor"
        emptyMessage="No vendors yet."
        filterFields={filterFields}
        filterFn={(r, v) =>
          textIncludes(r.name, v.name ?? "") &&
          selectMatches(r.kind, v.kind ?? "")
        }
        defaultSort={{ key: "status", direction: "asc" }}
        tieBreakerKey="name"
      />
    </div>
  );
}
