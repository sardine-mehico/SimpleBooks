"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { type Account, type RuleCondition } from "@/lib/types";
import { RuleConditionRow } from "./rule-condition-row";

export function RuleConditionsEditor({
  conditions, onChange, accounts,
}: {
  conditions: RuleCondition[];
  onChange: (next: RuleCondition[]) => void;
  accounts: Account[];
}) {
  function add() {
    onChange([...conditions, { field: "DESCRIPTION", operator: "CONTAINS", value: "", value2: null, valueList: [] }]);
  }
  function applyPreset(preset: "income" | "expense") {
    const presetCond: RuleCondition = preset === "income"
      ? { field: "AMOUNT", operator: "GT", value: "0", value2: null, valueList: [] }
      : { field: "AMOUNT", operator: "LT", value: "0", value2: null, valueList: [] };
    onChange([...conditions, presetCond]);
  }
  function updateAt(i: number, c: RuleCondition) {
    onChange(conditions.map((x, idx) => (idx === i ? c : x)));
  }
  function removeAt(i: number) {
    onChange(conditions.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("income")}>+ Income only (amount &gt; 0)</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("expense")}>+ Expense only (amount &lt; 0)</Button>
      </div>
      <div className="space-y-2">
        {conditions.map((c, i) => (
          <RuleConditionRow
            key={i}
            condition={c}
            onChange={(next) => updateAt(i, next)}
            onRemove={() => removeAt(i)}
            accounts={accounts}
          />
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> Add condition
      </Button>
    </div>
  );
}
