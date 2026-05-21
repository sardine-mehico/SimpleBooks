import { cn } from "@/lib/utils";

export function TransactionAmountCell({ amount }: { amount: string | number }) {
  const n = Number(amount);
  const credit = n >= 0;
  return (
    <span className={cn("font-mono tabular-nums", credit ? "text-green-700" : "text-red-700")}>
      {credit ? "+" : "−"}${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
