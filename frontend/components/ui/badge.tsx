import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
  {
    variants: {
      tone: {
        pending: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
        partial: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200",
        progress: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
        completed: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
        cancelled: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
        overdue: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
        paid: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
        draft: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
        neutral: "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
