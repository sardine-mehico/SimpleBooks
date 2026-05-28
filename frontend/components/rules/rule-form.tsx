"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { RuleConditionsEditor } from "./rule-conditions-editor";
import { RuleOutcomeEditor } from "./rule-outcome-editor";
import { createRule, deleteRule, testRules, updateRule } from "@/lib/banking-rules";
import type { Account, Category, Rule, RuleCondition } from "@/lib/types";

export function RuleForm({
  initial, categories, accounts,
}: {
  initial?: Rule; categories: Category[]; accounts: Account[];
}) {
  const router = useRouter();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? "");
  const [noteOnApply, setNoteOnApply] = useState(initial?.noteOnApply ?? "");
  const [conditions, setConditions] = useState<RuleCondition[]>(
    initial?.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value, value2: c.value2 ?? null, valueList: c.valueList ?? [] }))
    ?? [{ field: "DESCRIPTION", operator: "CONTAINS", value: "", value2: null, valueList: [] }]
  );
  const [saving, setSaving] = useState(false);
  const [sampleMatchCount, setSampleMatchCount] = useState<number | null>(null);

  useEffect(() => {
    const handle = setTimeout(async () => {
      const hasValue = conditions.length > 0 && conditions.every((c) => c.value !== "" || (c.valueList && c.valueList.length > 0));
      if (!hasValue || !categoryId) { setSampleMatchCount(null); return; }
      try {
        const r = await testRules({
          source: "existing",
          ruleIds: isEdit ? [initial!.id] : undefined,
        });
        setSampleMatchCount(r.stats.ruleMatched);
      } catch {
        setSampleMatchCount(null);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [conditions, categoryId, isEdit, initial?.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (conditions.length === 0) { alert("Add at least one condition."); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        categoryId,
        noteOnApply: noteOnApply.trim() || undefined,
        conditions,
      };
      if (isEdit) await updateRule(initial!.id, payload);
      else await createRule(payload);
      router.push("/rules");
    } finally { setSaving(false); }
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`Delete rule "${initial.name}"?`)) return;
    await deleteRule(initial.id);
    router.push("/rules");
  }

  return (
    <EditPageChrome
      title={isEdit ? "Edit Rule" : "New Rule"}
      backHref="/rules"
      formId="rule-form"
      saving={saving}
      rightActions={initial ? <Button type="button" variant="outline" onClick={onDelete}><Trash2 className="h-3.5 w-3.5"/> Delete</Button> : undefined}
    >
      <form id="rule-form" onSubmit={onSubmit} className="space-y-5">
        <Card className="p-6">
          <Field label="Rule name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} placeholder="e.g. RACI insurance" />
          </Field>
        </Card>

        <Card className="space-y-3 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Conditions (ALL must match)</h2>
          <RuleConditionsEditor conditions={conditions} onChange={setConditions} accounts={accounts} />
        </Card>

        <Card className="p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Outcome</h2>
          <RuleOutcomeEditor
            categoryId={categoryId} onCategoryId={setCategoryId}
            noteOnApply={noteOnApply} onNoteOnApply={setNoteOnApply}
            categories={categories}
          />
        </Card>

        {sampleMatchCount !== null && (
          <div className="text-xs text-slate-500">Sample matches in current data: {sampleMatchCount} transaction{sampleMatchCount === 1 ? "" : "s"}</div>
        )}
      </form>
    </EditPageChrome>
  );
}
