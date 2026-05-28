import { RulesList } from "@/components/rules/rules-list";
import { listRules } from "@/lib/banking-rules";
import { listAccounts } from "@/lib/banking";

export default async function Page() {
  const [rules, accounts] = await Promise.all([
    listRules({}),
    listAccounts(true),
  ]);
  return <RulesList initial={rules} accounts={accounts} />;
}
