import { api } from "@/lib/api";
import { PageShell } from "@/components/layout/page-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { InvoicesCard } from "@/components/dashboard/invoices-card";
import { TopCustomers } from "@/components/dashboard/top-customers";
import { BankAccounts } from "@/components/dashboard/bank-accounts";
import { PendingTasksCard } from "@/components/dashboard/pending-tasks";

type Summary = {
  totals: { totalRevenue: number; cashFlow: number; netIncome: number; receivable: number };
  monthly: { month: number; revenue: number; expense: number }[];
  pendingTasks: { id: string; title: string; status: string }[];
  recentInvoices: any[];
};

async function loadSummary(): Promise<Summary | null> {
  try {
    return await api<Summary>("/dashboard/summary");
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const data = await loadSummary();
  const totals = data?.totals ?? { totalRevenue: 0, cashFlow: 0, netIncome: 0, receivable: 0 };
  const monthly = data?.monthly ?? [];
  const tasks = data?.pendingTasks ?? [];
  const invoices = data?.recentInvoices ?? [];

  const topCustomers = [
    { name: "Alex Kurm", amount: 2200 },
    { name: "Saram Stelte", amount: 1000 },
    { name: "Mana Danan", amount: 500 },
    { name: "Pam Smith", amount: 500 },
  ];

  return (
    <PageShell title="Dashboard">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Revenue" value={totals.totalRevenue} delta={8.02} />
        <StatCard label="Cash Flow" value={totals.cashFlow} delta={13.48} />
        <StatCard label="Net Income" value={totals.netIncome} delta={13.5} suffix="Growth Income" />
        <StatCard label="Accounts Receivable" value={totals.receivable} delta={5.35} suffix="Total Receivable" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={monthly} />
        </div>
        <InvoicesCard invoices={invoices} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <BankAccounts />
        <TopCustomers rows={topCustomers} />
        <PendingTasksCard tasks={tasks} />
      </div>
    </PageShell>
  );
}
