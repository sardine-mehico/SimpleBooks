"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { COLUMN_ROLES, DATE_FORMATS, type ColumnMapping, type ColumnRole, type DateFormat } from "@/lib/types";

// Validates the Style-A-or-B rule client-side so the user gets immediate feedback.
export function validateMapping(m: ColumnMapping): string | null {
  const counts: Record<ColumnRole, number> = { date: 0, description: 0, amount: 0, debit: 0, credit: 0, balance: 0, ignore: 0 };
  for (const r of m.columns) counts[r]++;
  if (counts.date !== 1) return "Pick exactly one Date column.";
  if (counts.description < 1) return "Pick at least one Description column.";
  if (counts.balance > 1) return "Only one Balance column is allowed.";
  const styleA = counts.amount === 1 && counts.debit === 0 && counts.credit === 0;
  const styleB = counts.amount === 0 && counts.debit === 1 && counts.credit === 1;
  if (!styleA && !styleB) return "Either pick one Amount column, or one Debit + one Credit column.";
  return null;
}

export function ColumnMappingStep({
  previewRows,
  mapping,
  onChange,
  reasoning,
  applyRules,
  onApplyRulesChange,
}: {
  previewRows: string[][];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  reasoning: string[];
  applyRules: boolean;
  onApplyRulesChange: (v: boolean) => void;
}) {
  const ncols = mapping.columns.length;

  function setRole(idx: number, role: ColumnRole) {
    const next = { ...mapping, columns: mapping.columns.map((r, i) => (i === idx ? role : r)) };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Date format</label>
          <Select value={mapping.dateFormat} onValueChange={(v) => onChange({ ...mapping, dateFormat: v as DateFormat })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((d) => (<SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <input
            id="has-header"
            type="checkbox"
            checked={mapping.hasHeader}
            onChange={(e) => onChange({ ...mapping, hasHeader: e.target.checked })}
            className="h-4 w-4"
          />
          <label htmlFor="has-header" className="text-xs font-medium text-slate-600">File has a header row</label>
        </div>
      </div>

      <Card className="overflow-x-auto p-3">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              {Array.from({ length: ncols }).map((_, i) => (
                <th key={i} className="p-1.5 align-bottom">
                  <Select value={mapping.columns[i]} onValueChange={(v) => setRole(i, v as ColumnRole)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLUMN_ROLES.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri} className="border-t border-slate-100">
                {Array.from({ length: ncols }).map((_, ci) => (
                  <td key={ci} className="p-1.5 align-top font-mono text-[11px] text-slate-700">
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {reasoning.length > 0 && (
        <div className="text-xs text-slate-500">
          <div className="font-medium">Auto-detected:</div>
          <ul className="list-disc pl-5">
            {reasoning.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">After import</div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={applyRules}
            onChange={(e) => onApplyRulesChange(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <div>
            <div className="font-medium text-slate-900">Categorise based on rules</div>
            <div className="text-xs text-slate-600">Runs active rules over the just-imported transactions. Tag aliases auto-attach regardless of this setting.</div>
          </div>
        </label>
      </div>
    </div>
  );
}
