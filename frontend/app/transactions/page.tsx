import { PageShell } from "@/components/layout/page-shell";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { listAccounts } from "@/lib/banking";
import { listCategories, listVendors } from "@/lib/banking-rules";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [accounts, categories, vendors] = await Promise.all([listAccounts(true), listCategories(), listVendors(true)]);
  return (
    <PageShell title="Transactions">
      <TransactionsTable mode="global" accounts={accounts} categories={categories} vendors={vendors} searchParams={sp} />
    </PageShell>
  );
}
