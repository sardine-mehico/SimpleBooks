"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Tag } from "@/lib/types";

export function TagMultiSelect({
  tags,
  selectedIds,
  onChange,
  placeholder = "Pick tags…",
}: {
  tags: Tag[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const selected = selectedIds.map((id) => byId.get(id)).filter((t): t is Tag => !!t);

  const filtered = useMemo(() => {
    const active = tags.filter((t) => t.isActive);
    if (!query.trim()) return active;
    const q = query.trim().toLowerCase();
    return active.filter((t) =>
      t.name.toLowerCase().includes(q)
      || t.aliases.some((a) => a.toLowerCase().includes(q)),
    );
  }, [tags, query]);

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <div ref={wrapRef} className="relative space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-[0.3rem] border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50"
      >
        <span className="text-slate-500">{selected.length === 0 ? placeholder : `${selected.length} tag${selected.length === 1 ? '' : 's'} selected`}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-[0.3rem] border border-slate-300 bg-white p-2 shadow-md">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tags…"
            autoFocus
          />
          <div className="mt-2 max-h-64 overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs italic text-slate-500">No tags match</div>
            ) : (
              filtered.map((t) => {
                const isSelected = selectedIds.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                  >
                    <input type="checkbox" readOnly checked={isSelected} className="pointer-events-none" />
                    <span className="flex-1 truncate">{t.name}</span>
                    {t.aliases.length > 0 && (
                      <span className="text-xs text-slate-400 truncate max-w-[120px]" title={t.aliases.join(', ')}>
                        {t.aliases[0]}{t.aliases.length > 1 ? `, +${t.aliases.length - 1}` : ''}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs"
            >
              {t.name}
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="text-slate-400 hover:text-slate-700"
                aria-label={`Remove ${t.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
