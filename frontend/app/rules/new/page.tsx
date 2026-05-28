import { RuleForm } from "@/components/rules/rule-form";
import { listAccounts } from "@/lib/banking";
import { listCategories } from "@/lib/banking-rules";

export default async function Page() {
  const [categories, accounts] = await Promise.all([listCategories(), listAccounts(true)]);
  return <RuleForm categories={categories} accounts={accounts} />;
}
