import { AccountsList } from "@/components/accounts/accounts-list";
import { listAccounts } from "@/lib/banking";

export default async function Page() {
  const accounts = await listAccounts(true);
  return <AccountsList initial={accounts} />;
}
