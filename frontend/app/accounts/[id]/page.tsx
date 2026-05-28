import { AccountHeaderCard } from "@/components/accounts/account-header-card";
import { AccountRecategoriseShortcut } from "@/components/accounts/account-recategorise-shortcut";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { ImportCsvButton } from "@/components/transaction-imports/import-csv-button";
import { api } from "@/lib/api";
import { getAccount, listAccounts, getTransactionStats } from "@/lib/banking";
import { listCategories, listTags } from "@/lib/banking-rules";
import type { Customer } from "@/lib/types";
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
  const [account, allAccounts, categories, tags, stats, customers] = await Promise.all([
    getAccount(id),
    listAccounts(true),
    listCategories(),
    listTags(true),
    getTransactionStats([id]),
    api<Customer[]>("/customers").catch(() => [] as Customer[]),
  ]);
  return (
    <PageShell title={account.name}>
      <AccountHeaderCard
        account={account}
        rightAction={<ImportCsvButton accountId={account.id} />}
        categorisedCount={stats.categorised}
        totalCount={stats.total}
        recategoriseShortcut={<AccountRecategoriseShortcut accountId={account.id} />}
      />
      <TransactionsTable
        mode="account"
        fixedAccountId={account.id}
        accounts={allAccounts}
        categories={categories}
        tags={tags}
        customers={customers}
        searchParams={sp}
      />
    </PageShell>
  );
}
