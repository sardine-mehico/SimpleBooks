import { api } from "@/lib/api";
import { listAccounts } from "@/lib/banking";
import { TagsReportPage } from "@/components/reports/tags-report-page";
import type { Preferences, Account } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [accounts, prefs] = await Promise.all([
    listAccounts(),
    api<Preferences>("/preferences").catch(() => ({ financialYearStart: 7 } as Preferences)),
  ]);
  return (
    <TagsReportPage
      accounts={accounts.filter((a: Account) => (a as any).isActive !== false)}
      prefs={{ financialYearStart: prefs.financialYearStart ?? 7 }}
    />
  );
}
