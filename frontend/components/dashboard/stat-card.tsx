import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn, formatCompact } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  suffix,
}: {
  label: string;
  value: number;
  delta: number; // percentage
  suffix?: string;
}) {
  const positive = delta >= 0;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-5">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[26px] font-semibold tracking-tight text-slate-900 tabular-nums">
        {formatCompact(value)}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-slate-500">{suffix ?? label}</span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-medium",
            positive ? "text-emerald-600" : "text-rose-600"
          )}
        >
          {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(delta).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
