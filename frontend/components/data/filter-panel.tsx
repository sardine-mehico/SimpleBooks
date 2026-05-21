"use client";

import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FilterFieldDef =
  | { key: string; label: string; type: "text"; placeholder?: string }
  | {
      key: string;
      label: string;
      type: "select";
      options: { value: string; label: string }[];
      placeholder?: string;
    }
  | { key: string; label: string; type: "date"; placeholder?: string };

export function FilterPanel({
  fields,
  values,
  onChange,
  onClose,
  onClear,
  activeCount,
}: {
  fields: FilterFieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClose: () => void;
  onClear: () => void;
  activeCount: number;
}) {
  return (
    <Card className="mb-4 bg-[rgb(212_215_225_/_79%)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">Filter & Search</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
          aria-label="Close filters"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.type === "text" ? (
              <Input
                value={values[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
            ) : f.type === "date" ? (
              <Input
                type="date"
                value={values[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            ) : (
              <Select
                value={values[f.key] ?? "__all__"}
                onValueChange={(v) => onChange(f.key, v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={f.placeholder ?? "All"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        ))}
      </div>
      {activeCount > 0 && (
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear all
          </Button>
        </div>
      )}
    </Card>
  );
}

export function countActive(values: Record<string, string>) {
  return Object.values(values).filter((v) => v && v !== "__all__").length;
}

export function textIncludes(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

export function selectMatches<T extends string>(actual: T | null | undefined, filter: string) {
  if (!filter || filter === "__all__") return true;
  return actual === filter;
}
