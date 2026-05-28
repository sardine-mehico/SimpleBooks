"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Account } from "@/lib/types";

export function AccountMultiSelect({
  accounts,
  selected,
  onChange,
  placeholder = "All accounts",
  className,
}: {
  accounts: Account[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const allSelected = accounts.length > 0 && selected.length === accounts.length;
  const noneSelected = selected.length === 0;

  const triggerLabel = noneSelected
    ? placeholder
    : allSelected
      ? `All accounts (${accounts.length})`
      : selected.length === 1
        ? byId.get(selected[0])?.name ?? "1 account"
        : `${selected.length} accounts`;

  const filtered = useMemo(() => {
    if (!query.trim()) return accounts;
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => a.name.toLowerCase().includes(q));
  }, [accounts, query]);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <div ref={wrapRef} className={`relative ${className ?? "min-w-[180px]"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-[0.3rem] border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50"
      >
        <span className={noneSelected ? "text-slate-500" : "text-slate-700"}>{triggerLabel}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-[0.3rem] border border-slate-300 bg-white p-2 shadow-md">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts…"
            autoFocus
          />
          <div className="mt-2 flex items-center justify-between border-b border-slate-100 px-1 pb-1">
            <button
              type="button"
              onClick={() => onChange(accounts.map((a) => a.id))}
              className="text-xs text-indigo-600 hover:underline"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-slate-500 hover:underline"
            >
              Clear
            </button>
          </div>
          <div className="mt-1 max-h-64 overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs italic text-slate-500">No accounts match</div>
            ) : (
              filtered.map((a) => {
                const isSelected = selected.includes(a.id);
                return (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => toggle(a.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                  >
                    <input type="checkbox" readOnly checked={isSelected} className="pointer-events-none" />
                    <span className="flex-1 truncate">{a.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
