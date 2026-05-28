import { api } from "@/lib/api";
import { listAccounts } from "@/lib/banking";
import { listTags } from "@/lib/banking-rules";
import { ReportPage } from "@/components/reports/report-page";
import type { Preferences, Account } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [accounts, tags, prefs] = await Promise.all([
    listAccounts(),
    listTags(),
    api<Preferences>("/preferences").catch(() => ({ financialYearStart: 7 } as Preferences)),
  ]);
  return (
    <ReportPage
      kind="INCOME"
      accounts={accounts.filter((a: Account) => (a as any).isActive !== false)}
      tags={tags}
      prefs={{ financialYearStart: prefs.financialYearStart ?? 7 }}
    />
  );
}
