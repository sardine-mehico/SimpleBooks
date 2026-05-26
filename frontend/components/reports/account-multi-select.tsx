"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import type { Account } from "@/lib/types";

export function AccountMultiSelect({
  accounts,
  selected,
  onChange,
}: {
  accounts: Account[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  const remove = (id: string) => onChange(selected.filter((x) => x !== id));

  const allSelected = selected.length === accounts.length;
  const noneSelected = selected.length === 0;

  return (
    <div ref={containerRef} className="relative inline-flex flex-wrap items-center gap-1.5">
      {selected.map((id) => {
        const a = byId.get(id);
        if (!a) return null;
        return (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-[0.3rem] bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
          >
            {a.name}
            <button
              type="button"
              onClick={() => remove(id)}
              aria-label={`Remove ${a.name}`}
              className="rounded hover:bg-indigo-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
      {noneSelected && <span className="text-xs italic text-slate-400">no accounts selected</span>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-[0.3rem] border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
      >
        <Plus className="h-3 w-3" /> {allSelected ? "Edit" : "Add"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between border-b border-slate-100 px-2 pb-1">
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
          <div className="max-h-64 space-y-0.5 overflow-auto">
            {accounts.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={() => toggle(a.id)}
                  className="h-3.5 w-3.5 accent-indigo-600"
                />
                <span className="flex-1 truncate">{a.name}</span>
              </label>
            ))}
            {accounts.length === 0 && (
              <div className="px-2 py-3 text-center text-xs italic text-slate-400">no accounts</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
