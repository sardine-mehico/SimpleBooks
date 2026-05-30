"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number; // 0-indexed
  pageSize: number;
  total: number;
  onChange: (next: number) => void;
}) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) {
    // Still show summary on a single-page result so the row count is visible.
    return (
      <div className="flex shrink-0 items-center justify-end border-t border-slate-100 bg-white px-5 py-3 text-xs text-slate-500 shadow-[0_-1px_2px_rgba(0,0,0,0.04)]">
        Showing {total} of {total}
      </div>
    );
  }

  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-white px-5 py-3 text-xs text-slate-500 shadow-[0_-1px_2px_rgba(0,0,0,0.04)]">
      <span>
        Showing <span className="font-medium text-slate-700">{start}–{end}</span> of <span className="font-medium text-slate-700">{total}</span>
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-[0.3rem] border border-slate-200 bg-white px-2 text-slate-600 hover:bg-slate-50",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white",
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="px-2 tabular-nums text-slate-600">
          Page {page + 1} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-[0.3rem] border border-slate-200 bg-white px-2 text-slate-600 hover:bg-slate-50",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white",
          )}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
