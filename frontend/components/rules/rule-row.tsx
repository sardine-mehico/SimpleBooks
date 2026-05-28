"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CATEGORY_KINDS, RULE_FIELDS, type Rule } from "@/lib/types";
import { deleteRule, moveRule, toggleRuleActive } from "@/lib/banking-rules";

function conditionSummary(
  c: Rule["conditions"][number],
  accountNames: Map<string, string>,
): string {
  const fieldLabel = RULE_FIELDS.find((f) => f.value === c.field)?.label.toLowerCase() ?? c.field;
  const op = c.operator.toLowerCase().replace("_", " ");
  if (c.field === "ACCOUNT") {
    if (c.operator === "EQUALS") return `account is ${accountNames.get(c.value) ?? c.value}`;
    if (c.operator === "IN") return `account in [${(c.valueList ?? []).map((id) => accountNames.get(id) ?? id).join(", ")}]`;
  }
  if (c.operator === "BETWEEN") return `${fieldLabel} between ${c.value} and ${c.value2 ?? ""}`;
  return `${fieldLabel} ${op} "${c.value}"`;
}

export function RuleRow({
  rule,
  rank,
  accountNames,
}: {
  rule: Rule;
  rank: number;
  accountNames: Map<string, string>;
}) {
  const router = useRouter();
  const kindTone =
    CATEGORY_KINDS.find((k) => k.value === rule.category?.kind)?.tone ?? "bg-slate-100";

  async function onMove(direction: "up" | "down") {
    await moveRule(rule.id, direction);
    router.refresh();
  }
  async function onToggle() {
    await toggleRuleActive(rule.id, !rule.isActive);
    router.refresh();
  }
  async function onDelete() {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await deleteRule(rule.id);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="font-mono text-lg tabular-nums text-slate-400">{rank}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{rule.name}</span>
              {!rule.isActive && (
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                  Inactive
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {rule.conditions.map((c, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-1 text-slate-400">AND</span>}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                    {conditionSummary(c, accountNames)}
                  </code>
                </span>
              ))}
              <span className="mx-2 text-slate-400">→</span>
              <span className={`inline-block rounded-[0.3rem] px-2 py-0.5 text-xs ${kindTone}`}>
                {rule.category?.name}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Hits: {rule.hitCount}
              {rule.lastFiredAt && (
                <> · Last fired {new Date(rule.lastFiredAt).toLocaleDateString("en-AU")}</>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" onClick={onToggle} size="sm">
            {rule.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onMove("up")}
            size="sm"
            aria-label="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onMove("down")}
            size="sm"
            aria-label="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/rules/${rule.id}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button type="button" variant="outline" onClick={onDelete} size="sm">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
