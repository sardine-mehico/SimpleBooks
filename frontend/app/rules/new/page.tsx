import { RuleForm } from "@/components/rules/rule-form";
import { listAccounts } from "@/lib/banking";
import { listCategories, listVendors } from "@/lib/banking-rules";

export default async function Page() {
  const [categories, vendors, accounts] = await Promise.all([listCategories(), listVendors(true), listAccounts(true)]);
  return <RuleForm categories={categories} vendors={vendors} accounts={accounts} />;
}
