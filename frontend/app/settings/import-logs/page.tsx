import { ImportLogsList } from "@/components/settings/import-logs-list";
import { listAccounts, listImportLogs } from "@/lib/banking";

export default async function Page() {
  const [logs, accounts] = await Promise.all([
    listImportLogs({ pageSize: 500 }),
    listAccounts(true),
  ]);
  return <ImportLogsList initial={logs.items} accounts={accounts} />;
}
