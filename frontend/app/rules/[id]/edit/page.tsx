import { RuleForm } from "@/components/rules/rule-form";
import { listAccounts } from "@/lib/banking";
import { listCategories, listVendors, getRule } from "@/lib/banking-rules";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [rule, categories, vendors, accounts] = await Promise.all([getRule(id), listCategories(), listVendors(true), listAccounts(true)]);
  return <RuleForm initial={rule} categories={categories} vendors={vendors} accounts={accounts} />;
}
