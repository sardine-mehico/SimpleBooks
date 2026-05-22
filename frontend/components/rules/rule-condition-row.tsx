"use client";

import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  OPERATORS_BY_FIELD, RULE_FIELDS, type Account, type RuleCondition, type RuleField, type RuleOperator, type Vendor,
} from "@/lib/types";

export function RuleConditionRow({
  condition, onChange, onRemove, vendors, accounts,
}: {
  condition: RuleCondition;
  onChange: (next: RuleCondition) => void;
  onRemove: () => void;
  vendors: Vendor[];
  accounts: Account[];
}) {
  const ops = OPERATORS_BY_FIELD[condition.field];

  function onFieldChange(f: RuleField) {
    const defaultOp = OPERATORS_BY_FIELD[f][0].value;
    onChange({ field: f, operator: defaultOp, value: "", value2: null, valueList: [] });
  }

  return (
    <div className="grid grid-cols-[160px_140px_1fr_40px] gap-2">
      <Select value={condition.field} onValueChange={(v) => onFieldChange(v as RuleField)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {RULE_FIELDS.map((f) => (<SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>))}
        </SelectContent>
      </Select>

      <Select value={condition.operator} onValueChange={(v) => onChange({ ...condition, operator: v as RuleOperator, value: "", value2: null, valueList: [] })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {ops.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
        </SelectContent>
      </Select>

      <ValueInput condition={condition} onChange={onChange} vendors={vendors} accounts={accounts} />

      <Button type="button" variant="ghost" onClick={onRemove} aria-label="Remove condition" size="sm">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ValueInput({
  condition, onChange, vendors, accounts,
}: { condition: RuleCondition; onChange: (next: RuleCondition) => void; vendors: Vendor[]; accounts: Account[] }) {
  if (condition.field === "DESCRIPTION") {
    return <Input value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} placeholder="text to match" />;
  }
  if (condition.field === "AMOUNT") {
    if (condition.operator === "BETWEEN") {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" step="0.01" value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} placeholder="from" />
          <Input type="number" step="0.01" value={condition.value2 ?? ""} onChange={(e) => onChange({ ...condition, value2: e.target.value })} placeholder="to" />
        </div>
      );
    }
    return <Input type="number" step="0.01" value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} />;
  }
  if (condition.field === "VENDOR") {
    if (condition.operator === "IN") {
      const selected = new Set(condition.valueList ?? []);
      return (
        <div className="flex flex-wrap gap-1.5 rounded-[0.3rem] border border-slate-300 bg-white p-1.5">
          {vendors.map((v) => {
            const on = selected.has(v.id);
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  if (next.has(v.id)) next.delete(v.id); else next.add(v.id);
                  onChange({ ...condition, valueList: Array.from(next) });
                }}
                className={`rounded-[0.3rem] border px-2 py-0.5 text-xs ${on ? "border-indigo-400 bg-indigo-100 text-indigo-900" : "border-slate-300 bg-white text-slate-600"}`}
              >{v.name}</button>
            );
          })}
        </div>
      );
    }
    return (
      <Select value={condition.value} onValueChange={(v) => onChange({ ...condition, value: v })}>
        <SelectTrigger><SelectValue placeholder="pick vendor" /></SelectTrigger>
        <SelectContent>{vendors.map((v) => (<SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>))}</SelectContent>
      </Select>
    );
  }
  if (condition.field === "ACCOUNT") {
    if (condition.operator === "IN") {
      const selected = new Set(condition.valueList ?? []);
      return (
        <div className="flex flex-wrap gap-1.5 rounded-[0.3rem] border border-slate-300 bg-white p-1.5">
          {accounts.map((a) => {
            const on = selected.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                  onChange({ ...condition, valueList: Array.from(next) });
                }}
                className={`rounded-[0.3rem] border px-2 py-0.5 text-xs ${on ? "border-indigo-400 bg-indigo-100 text-indigo-900" : "border-slate-300 bg-white text-slate-600"}`}
              >{a.name}</button>
            );
          })}
        </div>
      );
    }
    return (
      <Select value={condition.value} onValueChange={(v) => onChange({ ...condition, value: v })}>
        <SelectTrigger><SelectValue placeholder="pick account" /></SelectTrigger>
        <SelectContent>{accounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}</SelectContent>
      </Select>
    );
  }
  return null;
}
