import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { STATUS_TONE, INVOICE_STATUSES, type Invoice } from "@/lib/types";

const STATUS_LABEL = Object.fromEntries(INVOICE_STATUSES.map((s) => [s.value, s.label]));

export function InvoicesCard({ invoices }: { invoices: Invoice[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
        <Link href="/invoices" className="text-xs text-indigo-600 hover:underline">
          Show all
        </Link>
      </CardHeader>
      <div className="px-5 pb-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b border-slate-100 pb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
          <div>Customer</div>
          <div>Date</div>
          <div>Status</div>
          <div className="text-right">Amount</div>
        </div>
        <ul className="divide-y divide-slate-100">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 py-2.5 text-sm"
            >
              <div className="truncate font-medium text-slate-900">
                {inv.customer?.name ?? "—"}
              </div>
              <div className="text-xs text-slate-500 tabular-nums">{formatDate(inv.invoiceDate)}</div>
              <Badge tone={STATUS_TONE[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>
              <div className="text-right font-medium tabular-nums text-slate-900">
                {formatCurrency(Number(inv.totalAmount))}
              </div>
            </li>
          ))}
          {invoices.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">No invoices yet</li>
          )}
        </ul>
      </div>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3">
        <Link href="/invoices" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
          Show invoices <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
}
