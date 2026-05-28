import { PageShell } from "@/components/layout/page-shell";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { api } from "@/lib/api";
import { listAccounts } from "@/lib/banking";
import { listCategories, listTags } from "@/lib/banking-rules";
import type { Customer } from "@/lib/types";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [accounts, categories, tags, customers] = await Promise.all([
    listAccounts(true),
    listCategories(),
    listTags(true),
    api<Customer[]>("/customers").catch(() => [] as Customer[]),
  ]);
  return (
    <PageShell title="Transactions">
      <TransactionsTable mode="global" accounts={accounts} categories={categories} tags={tags} customers={customers} searchParams={sp} />
    </PageShell>
  );
}
