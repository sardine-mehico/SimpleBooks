import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

const accounts = [
  { name: "Operating", type: "Bank", balance: 13500 },
  { name: "Reserve", type: "Bank", balance: 3995 },
  { name: "Tax Holding", type: "Bank", balance: 1350 },
];

export function BankAccounts() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank Accounts</CardTitle>
      </CardHeader>
      <div className="px-5 pb-5">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 border-b border-slate-100 pb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
          <div>Bank Account</div>
          <div>State</div>
          <div className="text-right">Balance</div>
        </div>
        <ul className="divide-y divide-slate-100">
          {accounts.map((a, i) => (
            <li
              key={i}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 py-3 text-sm"
            >
              <div className="font-medium text-slate-900">{a.name}</div>
              <div className="text-xs text-slate-500">{a.type}</div>
              <div className="text-right font-semibold text-slate-900 tabular-nums">
                {formatCurrency(a.balance)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
