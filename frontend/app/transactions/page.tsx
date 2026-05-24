import { PageShell } from "@/components/layout/page-shell";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { api } from "@/lib/api";
import { listAccounts } from "@/lib/banking";
import { listCategories, listVendors } from "@/lib/banking-rules";
import type { Customer } from "@/lib/types";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [accounts, categories, vendors, customers] = await Promise.all([
    listAccounts(true),
    listCategories(),
    listVendors(true),
    api<Customer[]>("/customers").catch(() => [] as Customer[]),
  ]);
  return (
    <PageShell title="Transactions">
      <TransactionsTable mode="global" accounts={accounts} categories={categories} vendors={vendors} customers={customers} searchParams={sp} />
    </PageShell>
  );
}
