import { RuleTestSandbox } from "@/components/rules/rule-test-sandbox";
import { listAccounts } from "@/lib/banking";
import { listRules } from "@/lib/banking-rules";

export default async function Page() {
  const [rules, accounts] = await Promise.all([listRules({}), listAccounts(true)]);
  return <RuleTestSandbox rules={rules} accounts={accounts} />;
}
