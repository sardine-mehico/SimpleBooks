"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setRuleState } from "@/lib/banking-rules";
import type { Rule } from "@/lib/types";

export function AiDraftRow({ rule }: { rule: Rule & { reasoning?: string | null } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(state: 'APPROVED' | 'DENIED') {
    setBusy(true);
    try {
      await setRuleState(rule.id, state);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-sm font-medium">{rule.name}</div>
      <div className="mt-1 text-xs text-slate-600">
        {rule.conditions.map((c, i) => (
          <span key={i}>
            {i > 0 && ' AND '}
            <span className="font-mono">{c.field}</span> {c.operator} <span className="font-mono">"{c.value}"{c.value2 ? ` … "${c.value2}"` : ''}</span>
          </span>
        ))} → set Category to <strong>{rule.category?.name ?? '—'}</strong>
      </div>
      {rule.noteOnApply && <div className="mt-1 text-xs italic text-slate-500">"{rule.noteOnApply}"</div>}
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => act('APPROVED')} disabled={busy}>Approve</Button>
        <Button size="sm" variant="outline" asChild><Link href={`/rules/${rule.id}/edit`}>Modify</Link></Button>
        <Button size="sm" variant="ghost" onClick={() => act('DENIED')} disabled={busy}>Deny</Button>
      </div>
    </div>
  );
}
