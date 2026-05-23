"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, AlertTriangle, Loader2 } from "lucide-react";
import { sniffCsv, commitImport } from "@/lib/banking";
import type { ColumnMapping, ImportReport, SniffResponse } from "@/lib/types";
import { ColumnMappingStep, validateMapping } from "./column-mapping-step";
import { ImportReportPopup } from "./import-report-popup";

type Stage = "choose" | "confirm" | "importing" | "report";

export function ImportCsvDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearch = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [sniff, setSniff] = useState<SniffResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [applyRules, setApplyRules] = useState(false);

  async function onFileChosen(f: File) {
    setError(null);
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a .csv file.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File exceeds the 10 MB limit.");
      return;
    }
    setFile(f);
    setStage("importing");
    try {
      const res = await sniffCsv(f, accountId);
      setSniff(res);
      setMapping(res.suggestedMapping.mapping);
      setStage("confirm");
    } catch (e) {
      setError((e as Error).message);
      setStage("choose");
    }
  }

  async function onCommit() {
    if (!file || !sniff || !mapping) return;
    const v = validateMapping(mapping);
    if (v) { setError(v); return; }
    setError(null);
    setStage("importing");
    try {
      const r = await commitImport(file, accountId, sniff.fileSha256, mapping, applyRules);
      setReport(r);
      setStage("report");
      // Bump a refresh token in the URL so the TransactionsTable's client-side
      // fetcher re-runs. router.refresh() alone won't trigger it — the table
      // owns its own data, not server-passed props. router.replace keeps the
      // popup mounted (no navigation), the parent re-renders with new
      // searchParams, and the table's useEffect dep on `refreshToken` fires.
      const params = new URLSearchParams(urlSearch.toString());
      params.set("r", String(Date.now()));
      router.replace(`${pathname}?${params.toString()}`);
    } catch (e) {
      setError((e as Error).message);
      setStage("confirm");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {stage === "choose" && "Import CSV"}
            {stage === "confirm" && "Confirm column mapping"}
            {stage === "importing" && "Importing…"}
            {stage === "report" && "Import complete"}
          </DialogTitle>
        </DialogHeader>

        {stage === "choose" && (
          <div className="space-y-3">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFileChosen(e.target.files[0])}
            />
            <Button type="button" onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" /> Choose CSV file
            </Button>
            <div className="text-xs text-slate-500">Max 10 MB. Headerless CBA-style exports work out of the box.</div>
            {error && <div className="text-sm text-red-700">{error}</div>}
          </div>
        )}

        {stage === "confirm" && sniff && mapping && (
          <div className="space-y-3">
            {sniff.alreadyImportedAs && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                This exact file was already imported. Proceeding will only insert new rows.
              </div>
            )}
            <ColumnMappingStep
              previewRows={sniff.previewRows}
              mapping={mapping}
              onChange={setMapping}
              reasoning={sniff.suggestedMapping.reasoning}
              applyRules={applyRules}
              onApplyRulesChange={setApplyRules}
            />
            {error && <div className="text-sm text-red-700">{error}</div>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="button" onClick={onCommit}>Import</Button>
            </DialogFooter>
          </div>
        )}

        {stage === "importing" && (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2">Processing CSV…</span>
          </div>
        )}

        {stage === "report" && report && (
          <ImportReportPopup data={report} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
