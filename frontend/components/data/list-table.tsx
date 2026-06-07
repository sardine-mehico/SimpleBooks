"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/data/pagination";
import { cn } from "@/lib/utils";

export const DEFAULT_PAGE_SIZE = 100;

export type SortDirection = "asc" | "desc";
export type SortSpec = { key: string; direction: SortDirection };

export type Column<T> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render: (row: T) => React.ReactNode;
  width?: string;
  // Returning a value enables sorting on this column. Boolean values sort
  // true-first on ascending (used for "Active first" default).
  sortValue?: (row: T) => string | number | boolean | Date | null | undefined;
};

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return a === b ? 0 : a ? -1 : 1;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  const da = a instanceof Date ? a.getTime() : null;
  const db = b instanceof Date ? b.getTime() : null;
  if (da != null && db != null) return da - db;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

export function ListTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage,
  rowHref,
  defaultSort,
  tieBreakerKey,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  rowHref?: (row: T) => string;
  defaultSort?: SortSpec;
  tieBreakerKey?: string;
  pageSize?: number;
}) {
  const [sort, setSort] = useState<SortSpec | null>(defaultSort ?? null);
  const [page, setPage] = useState(0);

  function toggleSort(key: string) {
    setSort((curr) => {
      if (!curr || curr.key !== key) return { key, direction: "asc" };
      return { key, direction: curr.direction === "asc" ? "desc" : "asc" };
    });
  }

  // Reset to first page whenever the underlying row set or sort changes.
  useEffect(() => {
    setPage(0);
  }, [rows, sort]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const primary = columns.find((c) => c.key === sort.key);
    const tie = tieBreakerKey ? columns.find((c) => c.key === tieBreakerKey) : undefined;
    if (!primary?.sortValue) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      let c = compareValues(primary.sortValue!(a), primary.sortValue!(b));
      if (sort.direction === "desc") c = -c;
      if (c !== 0) return c;
      if (tie?.sortValue && tie !== primary) {
        return compareValues(tie.sortValue(a), tie.sortValue(b));
      }
      return 0;
    });
    return arr;
  }, [rows, sort, columns, tieBreakerKey]);

  const paginated = useMemo(
    () => sorted.slice(page * pageSize, (page + 1) * pageSize),
    [sorted, page, pageSize],
  );

  const gridTemplate = columns.map((c) => c.width ?? "1fr").join(" ");

  return (
    <Card className="flex max-h-[calc(100vh-12rem)] flex-col overflow-hidden">
      <div className="flex w-full flex-1 flex-col overflow-x-auto overflow-y-hidden">
        <div className="flex min-w-[640px] min-h-0 flex-1 flex-col md:min-w-0">
      <div
        className="grid shrink-0 items-center gap-x-4 border-b border-slate-100 bg-[#b6bacb] px-5 py-2.5 text-[12px] font-medium uppercase tracking-wider text-white"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((c) => {
          const isSortable = !!c.sortValue;
          const isActive = sort?.key === c.key;
          const justify =
            c.align === "right" ? "justify-end" : c.align === "center" ? "justify-center" : "justify-start";
          return (
            <div
              key={c.key}
              className={cn(
                "flex items-center gap-1",
                justify,
                isSortable && "cursor-pointer select-none hover:text-white/80"
              )}
              onClick={isSortable ? () => toggleSort(c.key) : undefined}
              role={isSortable ? "button" : undefined}
              tabIndex={isSortable ? 0 : undefined}
              onKeyDown={
                isSortable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSort(c.key);
                      }
                    }
                  : undefined
              }
            >
              <span>{c.label}</span>
              {isSortable ? (
                isActive ? (
                  sort!.direction === "asc" ? (
                    <ChevronUp className="h-3 w-3 text-white" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-white" />
                  )
                ) : (
                  <ChevronsUpDown className="h-3 w-3 text-white/60" />
                )
              ) : null}
            </div>
          );
        })}
      </div>
      <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {sorted.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-slate-400">
            {emptyMessage ?? "No records yet"}
          </li>
        )}
        {paginated.map((row) => {
          const cells = (
            <div
              className="grid items-center gap-x-4 px-5 py-3 text-sm"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {columns.map((c) => (
                <div
                  key={c.key}
                  className={cn(
                    "min-w-0 truncate",
                    c.align === "right" && "text-right tabular-nums",
                    c.align === "center" && "text-center"
                  )}
                >
                  {c.render(row)}
                </div>
              ))}
            </div>
          );
          return (
            <li key={row.id} className="hover:bg-slate-50/80 transition-colors">
              {rowHref ? (
                <Link href={rowHref(row)} className="block">
                  {cells}
                </Link>
              ) : (
                cells
              )}
            </li>
          );
        })}
      </ul>
        </div>
      </div>
      <Pagination page={page} pageSize={pageSize} total={sorted.length} onChange={setPage} />
    </Card>
  );
}
