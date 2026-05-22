"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Plus, FlaskConical } from "lucide-react";
import { RULE_STATES, type Account, type Rule, type RuleState, type Vendor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RuleRow } from "./rule-row";

export function RulesList({
  initial,
  vendors,
  accounts,
}: {
  initial: Rule[];
  vendors: Vendor[];
  accounts: Account[];
}) {
  const [stateFilter, setStateFilter] = useState<RuleState>("USER");

  const counts: Record<RuleState, number> = useMemo(() => {
    const acc = { USER: 0, AI_DRAFTED: 0, APPROVED: 0, DENIED: 0 };
    for (const r of initial) acc[r.state]++;
    return acc;
  }, [initial]);

  const filtered = useMemo(
    () => initial.filter((r) => r.state === stateFilter),
    [initial, stateFilter],
  );
  const vendorNames = useMemo(
    () => new Map(vendors.map((v) => [v.id, v.name])),
    [vendors],
  );
  const accountNames = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  return (
    <PageShell
      title="Rules"
      actions={
        <>
          <Button asChild variant="outline">
            <Link href="/rules/test">
              <FlaskConical className="h-4 w-4" /> Test rules
            </Link>
          </Button>
          <Button asChild>
            <Link href="/rules/new">
              <Plus className="h-4 w-4" /> New rule
            </Link>
          </Button>
        </>
      }
    >
      <div className="mb-4 flex gap-2">
        {RULE_STATES.map((s) => {
          const c = counts[s.value];
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setStateFilter(s.value)}
              className={cn(
                "rounded-[0.3rem] border px-3 py-1.5 text-sm",
                stateFilter === s.value
                  ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {s.label} <span className="ml-1 text-slate-400">({c})</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          No rules in this state yet.
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((r, i) => (
          <RuleRow
            key={r.id}
            rule={r}
            rank={i + 1}
            vendorNames={vendorNames}
            accountNames={accountNames}
          />
        ))}
      </div>
    </PageShell>
  );
}
