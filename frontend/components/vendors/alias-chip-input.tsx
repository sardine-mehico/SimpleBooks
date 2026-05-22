"use client";

import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AliasChipInput({
  value,
  onChange,
  placeholder = "Type alias and press Enter…",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim().toLowerCase();
    if (!v) return;
    if (value.includes(v)) { setDraft(""); return; }
    onChange([...value, v]);
    setDraft("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="rounded-[0.3rem] border border-slate-300 bg-white px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((a, i) => (
          <span key={i} className={cn(
            "inline-flex items-center gap-1 rounded-[0.3rem] bg-slate-100 px-2 py-0.5 text-xs text-slate-700",
          )}>
            <span className="font-mono">{a}</span>
            <button type="button" onClick={() => removeAt(i)} className="text-slate-500 hover:text-slate-900">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={value.length === 0 ? placeholder : ""}
          className="h-7 min-w-[120px] flex-1 border-0 px-1 py-0 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
