"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle, Check } from "lucide-react";
import { VENDOR_KINDS, type Account, type VendorExtractionCandidate, type VendorKind } from "@/lib/types";
import { extractVendorCandidates, commitVendorCandidates } from "@/lib/banking-rules";

type Stage = "configure" | "loading" | "review" | "done";

type Editable = VendorExtractionCandidate & {
  selected: boolean;
  editedName: string;
  editedKind: VendorKind;
  editedAliases: string;
};

export function VendorExtractor({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("configure");
  const [source, setSource] = useState<"all-transactions" | "csv">("all-transactions");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [csvBase64, setCsvBase64] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Editable[]>([]);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setError("File exceeds 10 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1];
      setCsvBase64(b64);
      setError(null);
    };
    reader.readAsDataURL(f);
  }

  async function onExtract() {
    setError(null);
    setStage("loading");
    try {
      const raw = await extractVendorCandidates({
        source,
        csvBase64: source === "csv" ? csvBase64 ?? undefined : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        accountIds: accountIds.length ? accountIds : undefined,
      });
      const editable: Editable[] = raw.map((c) => ({
        ...c,
        selected: c.existsAs === null,
        editedName: c.suggestedName,
        editedKind: c.suggestedKind,
        editedAliases: c.aliases.join(", "),
      }));
      setCandidates(editable);
      setStage("review");
    } catch (e) {
      setError((e as Error).message);
      setStage("configure");
    }
  }

  async function onCommit() {
    setStage("loading");
    try {
      const payload = candidates
        .filter((c) => c.selected)
        .map((c) => ({
          name: c.editedName.trim(),
          kind: c.editedKind,
          aliases: c.editedAliases.split(",").map((a) => a.trim()).filter(Boolean),
        }));
      const r = await commitVendorCandidates(payload);
      setResult(r);
      setStage("done");
    } catch (e) {
      setError((e as Error).message);
      setStage("review");
    }
  }

  return (
    <div className="px-6 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Suggest vendors from transactions</h1>
      </div>

      {stage === "configure" && (
        <Card className="space-y-4 p-6">
          <Field label="Source">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="src" checked={source === "all-transactions"} onChange={() => setSource("all-transactions")} />
                Use all imported transactions
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="src" checked={source === "csv"} onChange={() => setSource("csv")} />
                Upload a CSV (parsed in-memory, never saved)
              </label>
            </div>
          </Field>
          {source === "all-transactions" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Date from (optional)">
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </Field>
              <Field label="Date to (optional)">
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </Field>
              <Field label="Accounts (optional)">
                <div className="flex flex-wrap gap-1.5">
                  {accounts.map((a) => {
                    const on = accountIds.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAccountIds((curr) => curr.includes(a.id) ? curr.filter((x) => x !== a.id) : [...curr, a.id])}
                        className={`rounded-[0.3rem] border px-2 py-1 text-xs ${on ? "border-indigo-400 bg-indigo-100 text-indigo-900" : "border-slate-300 bg-white text-slate-600"}`}
                      >{a.name}</button>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}
          {source === "csv" && (
            <Field label="CSV file (max 10 MB)">
              <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
              {csvBase64 && <div className="mt-1 text-xs text-emerald-700"><Check className="inline h-3 w-3" /> File loaded ({Math.ceil(csvBase64.length * 0.75 / 1024)} KB)</div>}
            </Field>
          )}
          {error && <div className="text-sm text-red-700"><AlertCircle className="inline h-3 w-3" /> {error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => router.push("/vendors")}>Cancel</Button>
            <Button type="button" onClick={onExtract} disabled={source === "csv" && !csvBase64}>Extract candidates</Button>
          </div>
        </Card>
      )}

      {stage === "loading" && (
        <Card className="flex items-center justify-center p-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> <span className="ml-2">Scanning descriptions…</span>
        </Card>
      )}

      {stage === "review" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              {candidates.filter((c) => c.selected).length} of {candidates.length} selected
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStage("configure")}>Back</Button>
              <Button type="button" onClick={onCommit}>Create selected</Button>
            </div>
          </div>
          {error && <div className="mb-3 text-sm text-red-700"><AlertCircle className="inline h-3 w-3" /> {error}</div>}
          {candidates.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No candidates found. Either there are no transactions to scan or no common vendor patterns appeared.</div>
          ) : (
          <ul className="divide-y divide-slate-100">
            {candidates.map((c, i) => (
              <li key={i} className="grid grid-cols-[24px_1.5fr_120px_2fr_80px_60px] items-center gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.selected}
                  onChange={(e) => setCandidates((cur) => cur.map((x, idx) => idx === i ? { ...x, selected: e.target.checked } : x))}
                  className="h-4 w-4"
                />
                <Input
                  value={c.editedName}
                  onChange={(e) => setCandidates((cur) => cur.map((x, idx) => idx === i ? { ...x, editedName: e.target.value } : x))}
                  className="h-8"
                />
                <Select
                  value={c.editedKind}
                  onValueChange={(v) => setCandidates((cur) => cur.map((x, idx) => idx === i ? { ...x, editedKind: v as VendorKind } : x))}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VENDOR_KINDS.map((k) => (<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Input
                  value={c.editedAliases}
                  onChange={(e) => setCandidates((cur) => cur.map((x, idx) => idx === i ? { ...x, editedAliases: e.target.value } : x))}
                  className="h-8 font-mono text-xs"
                  placeholder="comma-separated aliases"
                />
                <span className="text-right tabular-nums text-slate-500">{c.matchCount}</span>
                {c.existsAs && (
                  <span className="text-right text-xs text-amber-700" title={`Would merge into existing vendor "${c.existsAs}"`}>exists</span>
                )}
                {!c.existsAs && <span />}
              </li>
            ))}
          </ul>
          )}
        </Card>
      )}

      {stage === "done" && result && (
        <Card className="space-y-3 p-6">
          <div className="text-emerald-700">
            <Check className="inline h-4 w-4" /> Created {result.created} new vendors. Updated {result.updated} existing with extra aliases. Skipped {result.skipped}.
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => router.push("/vendors")}>Back to vendors</Button>
            <Button type="button" onClick={() => router.push("/transactions")}>Go to Re-categorise</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
