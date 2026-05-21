import { AccountForm } from "@/components/accounts/account-form";
import { getAccount, listAccountTypes } from "@/lib/banking";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [account, types] = await Promise.all([getAccount(id), listAccountTypes()]);
  return <AccountForm initial={account} accountTypes={types.filter((t) => t.isActive || t.id === account.accountTypeId)} />;
}
