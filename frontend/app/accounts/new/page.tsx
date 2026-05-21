import { AccountForm } from "@/components/accounts/account-form";
import { listAccountTypes } from "@/lib/banking";

export default async function Page() {
  const types = await listAccountTypes();
  return <AccountForm accountTypes={types.filter((t) => t.isActive)} />;
}
