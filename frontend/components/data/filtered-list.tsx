"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Filter, Plus } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ListTable, type Column, type SortSpec } from "@/components/data/list-table";
import {
  FilterPanel,
  countActive,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filter-panel";
import { cn } from "@/lib/utils";

export { textIncludes, selectMatches };
export type { FilterFieldDef };

type Props<T extends { id: string }> = {
  title: string;
  rows: T[];
  columns: Column<T>[];
  rowHref?: (row: T) => string;
  emptyMessage?: string;
  newHref?: string;
  newLabel?: string;
  filterFields: FilterFieldDef[];
  filterFn: (row: T, values: Record<string, string>) => boolean;
  defaultSort?: SortSpec;
  tieBreakerKey?: string;
};

export function FilteredList<T extends { id: string }>({
  title,
  rows,
  columns,
  rowHref,
  emptyMessage,
  newHref,
  newLabel,
  filterFields,
  filterFn,
  defaultSort,
  tieBreakerKey,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const activeCount = useMemo(() => countActive(values), [values]);
  const filtered = useMemo(() => {
    if (activeCount === 0) return rows;
    return rows.filter((r) => filterFn(r, values));
  }, [rows, values, activeCount, filterFn]);

  return (
    <PageShell
      title={title}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen((o) => !o)}
            className={cn(open && "border-indigo-300 bg-indigo-50/40")}
          >
            <Filter className="h-4 w-4" />
            Filter
            {activeCount > 0 && (
              <span className="ml-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                {activeCount}
              </span>
            )}
          </Button>
          {newHref ? (
            <Button asChild>
              <Link href={newHref}>
                <Plus className="h-4 w-4" />
                {newLabel ?? "New"}
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      {open && (
        <FilterPanel
          fields={filterFields}
          values={values}
          onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
          onClose={() => setOpen(false)}
          onClear={() => setValues({})}
          activeCount={activeCount}
        />
      )}

      <ListTable
        columns={columns}
        rows={filtered}
        rowHref={rowHref}
        defaultSort={defaultSort}
        tieBreakerKey={tieBreakerKey}
        emptyMessage={
          activeCount > 0 ? "No matches for the current filters." : emptyMessage
        }
      />
    </PageShell>
  );
}
