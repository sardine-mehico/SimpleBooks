import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportReportPopup } from "@/components/transaction-imports/import-report-popup";
import { getImportLog } from "@/lib/banking";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await getImportLog(id);
  return (
    <div className="px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Import Report</h1>
        <Link
          href="/settings/import-logs"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to logs
        </Link>
      </div>
      <ImportReportPopup data={log.reportJson} />
    </div>
  );
}
