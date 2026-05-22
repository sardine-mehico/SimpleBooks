import { RulesList } from "@/components/rules/rules-list";
import { listRules, listVendors } from "@/lib/banking-rules";
import { listAccounts } from "@/lib/banking";

export default async function Page() {
  const [rules, vendors, accounts] = await Promise.all([
    listRules({}),
    listVendors(true),
    listAccounts(true),
  ]);
  return <RulesList initial={rules} vendors={vendors} accounts={accounts} />;
}
