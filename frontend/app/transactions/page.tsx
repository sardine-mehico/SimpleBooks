import { PageShell } from "@/components/layout/page-shell";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { listAccounts } from "@/lib/banking";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const accounts = await listAccounts(true);
  return (
    <PageShell title="Transactions">
      <TransactionsTable mode="global" accounts={accounts} searchParams={sp} />
    </PageShell>
  );
}
