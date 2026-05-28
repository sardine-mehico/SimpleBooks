"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { recategorise } from "@/lib/banking-rules";
import type { EngineOutput } from "@/lib/types";

export function RecategoriseDialog({
  filter, onClose,
}: {
  filter: { accountIds?: string[]; dateFrom?: string; dateTo?: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<"uncategorised" | "all">("uncategorised");
  const [preserveSplits, setPreserveSplits] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EngineOutput | null>(null);

  async function onRun() {
    setRunning(true);
    try {
      const r = await recategorise({ scope, ...filter, preserveSplits });
      setResult(r);
      router.refresh();
    } finally { setRunning(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-categorise transactions</DialogTitle>
        </DialogHeader>

        {!result && (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-600">Apply rules to:</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={scope === "uncategorised"} onChange={() => setScope("uncategorised")} />
                Uncategorised only (in current filter)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />
                All transactions (in current filter)
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={preserveSplits} onChange={(e) => setPreserveSplits(e.target.checked)} className="h-4 w-4" />
              Preserve manual splits (recommended)
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="button" onClick={onRun} disabled={running}>
                {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</> : "Re-categorise"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {result && (
          <div className="space-y-3 text-sm">
            <div className="text-emerald-700">Categorised {result.stats.ruleMatched} transactions</div>
            <ul className="ml-4 list-disc text-xs text-slate-600">
              {result.stats.perRule.map((p) => (
                <li key={p.ruleId}>{p.ruleName}: {p.count}</li>
              ))}
            </ul>
            <div className="text-slate-600">
              {result.stats.unchanged} had no rule match · {result.stats.preservedSplits} skipped (already split)
            </div>
            <DialogFooter><Button type="button" onClick={onClose}>Close</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
