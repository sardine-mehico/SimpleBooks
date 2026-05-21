import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type Row = { name: string; amount: number };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TopCustomers({ rows }: { rows: Row[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Customers</CardTitle>
      </CardHeader>
      <ul className="px-5 pb-5">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-700">
                {initials(r.name)}
              </div>
              <span className="text-sm font-medium text-slate-800">{r.name}</span>
            </div>
            <span className="text-sm font-semibold text-slate-900 tabular-nums">
              {formatCurrency(r.amount)}
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-6 text-center text-sm text-slate-400">No customers yet</li>
        )}
      </ul>
    </Card>
  );
}
