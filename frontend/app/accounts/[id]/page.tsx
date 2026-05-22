import { AccountHeaderCard } from "@/components/accounts/account-header-card";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { ImportCsvButton } from "@/components/transaction-imports/import-csv-button";
import { getAccount, listAccounts } from "@/lib/banking";
import { listCategories } from "@/lib/banking-rules";
import { PageShell } from "@/components/layout/page-shell";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [account, allAccounts, categories] = await Promise.all([getAccount(id), listAccounts(true), listCategories()]);
  return (
    <PageShell title={account.name}>
      <AccountHeaderCard
        account={account}
        rightAction={<ImportCsvButton accountId={account.id} />}
      />
      <TransactionsTable
        mode="account"
        fixedAccountId={account.id}
        accounts={allAccounts}
        categories={categories}
        searchParams={sp}
      />
    </PageShell>
  );
}
