"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Eye, EyeOff, Plus, ArrowUp, ArrowDown, Beaker, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { createAiProvider, deleteAiProvider, setAiProviderPrimary, updateAiProvider, moveAiProvider, testAiProvider, listAiProviders } from "@/lib/ai-providers";
import type { ProviderTestResult } from "@/lib/ai-providers";
import { api } from "@/lib/api";
import type { AiProvider } from "@/lib/types";

type Draft = {
  id: string;
  name: string;
  model: string;
  apiBaseUrl: string;
  apiKey: string;
  isPrimary: boolean;
  requestsPerMinute: number;
  dirty: boolean;       // true once any field has changed since last save
  isNew: boolean;       // true if not yet persisted
  showKey: boolean;     // toggle for the eye icon
};

function toDraft(p: AiProvider): Draft {
  return { id: p.id, name: p.name, model: p.model, apiBaseUrl: p.apiBaseUrl, apiKey: p.apiKey, isPrimary: p.isPrimary, requestsPerMinute: p.requestsPerMinute ?? 15, dirty: false, isNew: false, showKey: false };
}

export function AiSetupPage({ initial, prefs }: { initial: AiProvider[]; prefs?: { aiMiningThreshold?: number } }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(initial.map(toDraft));
  const [threshold, setThreshold] = useState<number>(prefs?.aiMiningThreshold ?? 3);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [testResults, setTestResults] = useState<Map<string, ProviderTestResult | 'pending'>>(new Map());

  function update(id: string, patch: Partial<Draft>) {
    setDrafts((curr) => curr.map((d) => (d.id === id ? { ...d, ...patch, dirty: true } : d)));
  }

  function toggleKey(id: string) {
    setDrafts((curr) => curr.map((d) => (d.id === id ? { ...d, showKey: !d.showKey } : d)));
  }

  function addNew() {
    const tempId = `new-${Date.now()}`;
    setDrafts((curr) => [
      ...curr,
      { id: tempId, name: "New AI Configuration", model: "", apiBaseUrl: "https://api.openai.com/v1", apiKey: "", isPrimary: curr.length === 0, requestsPerMinute: 15, dirty: true, isNew: true, showKey: false },
    ]);
  }

  async function save(d: Draft) {
    if (d.isNew) {
      const created = await createAiProvider({ name: d.name, model: d.model, apiBaseUrl: d.apiBaseUrl, apiKey: d.apiKey, requestsPerMinute: d.requestsPerMinute });
      setDrafts((curr) => curr.map((x) => (x.id === d.id ? { ...toDraft(created) } : x)));
    } else {
      const updated = await updateAiProvider(d.id, { name: d.name, model: d.model, apiBaseUrl: d.apiBaseUrl, apiKey: d.apiKey, requestsPerMinute: d.requestsPerMinute });
      setDrafts((curr) => curr.map((x) => (x.id === d.id ? { ...toDraft(updated), showKey: x.showKey } : x)));
    }
    router.refresh();
  }

  async function makePrimary(d: Draft) {
    if (d.isNew) return;
    await setAiProviderPrimary(d.id);
    setDrafts((curr) => curr.map((x) => ({ ...x, isPrimary: x.id === d.id })));
    router.refresh();
  }

  async function remove(d: Draft) {
    if (d.isNew) {
      setDrafts((curr) => curr.filter((x) => x.id !== d.id));
      return;
    }
    if (!confirm(`Delete "${d.name}"?`)) return;
    await deleteAiProvider(d.id);
    setDrafts((curr) => curr.filter((x) => x.id !== d.id));
    router.refresh();
  }

  async function move(d: Draft, direction: 'up' | 'down') {
    if (d.isPrimary || d.isNew) return;
    await moveAiProvider(d.id, direction);
    // Re-fetch authoritative order from backend. router.refresh() alone is not
    // enough — `drafts` state was initialised once from the prop via useState
    // and won't update when new props arrive after a server re-render.
    const fresh = await listAiProviders();
    setDrafts((curr) => fresh.map((p) => {
      const existing = curr.find((x) => x.id === p.id);
      // Preserve dirty in-progress local edits but adopt the new ordering.
      if (existing?.dirty) {
        return { ...existing, isPrimary: p.isPrimary };
      }
      return toDraft(p);
    }));
  }

  async function runTest(id: string) {
    setTestResults((m) => new Map(m).set(id, 'pending'));
    try {
      const r = await testAiProvider(id);
      setTestResults((m) => new Map(m).set(id, r));
    } catch (e: any) {
      setTestResults((m) => new Map(m).set(id, { ok: false, latencyMs: 0, errorMessage: e?.message ?? 'request failed' }));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">AI Setup</h1>
        <p className="mt-1 text-sm text-slate-600">Configure primary and backup AI models for AI processing (OpenAI-compatible APIs).</p>
      </div>

      {drafts.length === 0 && (
        <Card className="border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          No AI configurations yet. Add one to get started.
        </Card>
      )}

      {drafts.map((d) => (
        <Card key={d.id} className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-900">{d.name || "(unnamed)"}</span>
              {d.isPrimary ? (
                <span className="inline-block rounded-[0.3rem] bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Primary</span>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => move(d, 'up')} aria-label="Move up">
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => move(d, 'down')} aria-label="Move down">
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <button type="button" onClick={() => makePrimary(d)} className="text-xs text-indigo-700 hover:underline">Set Primary</button>
                </>
              )}
            </div>
            <button type="button" onClick={() => remove(d)} className="text-slate-400 hover:text-red-700" aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Name">
              <Input value={d.name} onChange={(e) => update(d.id, { name: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Model">
              <Input value={d.model} onChange={(e) => update(d.id, { model: e.target.value })} maxLength={120} placeholder="gpt-4o" />
            </Field>
          </div>
          <Field label="API Base URL">
            <Input value={d.apiBaseUrl} onChange={(e) => update(d.id, { apiBaseUrl: e.target.value })} maxLength={500} placeholder="https://api.openai.com/v1" />
          </Field>
          <Field label="API Key">
            <div className="relative">
              <Input
                type={d.showKey ? "text" : "password"}
                value={d.apiKey}
                onChange={(e) => update(d.id, { apiKey: e.target.value })}
                maxLength={2000}
                placeholder="sk-..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => toggleKey(d.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                aria-label={d.showKey ? "Hide API key" : "Show API key"}
              >
                {d.showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Requests per minute">
            <div className="flex items-center gap-3">
              <Input
                type="number" min={1} max={10000}
                value={d.requestsPerMinute}
                onChange={(e) => update(d.id, { requestsPerMinute: Math.max(1, Math.min(10000, Number(e.target.value) || 1)) })}
                className="w-28"
              />
              <span className="text-xs text-slate-500">~15 free, ~60 paid lite, ~1000 paid</span>
            </div>
          </Field>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => runTest(d.id)} disabled={testResults.get(d.id) === 'pending' || d.isNew}>
                <Beaker className="h-3 w-3" /> Test
              </Button>
              <Button type="button" onClick={() => save(d)} disabled={!d.dirty} size="sm">
                Save
              </Button>
            </div>
            {testResults.get(d.id) && (
              <div className="mt-1 text-xs">
                {testResults.get(d.id) === 'pending' ? (
                  <span className="text-slate-500">Testing…</span>
                ) : (() => {
                  const r = testResults.get(d.id) as ProviderTestResult;
                  if (r.ok) {
                    return (
                      <span className="text-emerald-700">
                        <CheckCircle className="inline h-3 w-3" /> Connected — {r.latencyMs}ms
                        {r.preview && <span className="ml-2 text-slate-500 italic">"{r.preview}"</span>}
                      </span>
                    );
                  }
                  return (
                    <span className="text-rose-700">
                      <XCircle className="inline h-3 w-3" />{' '}
                      {r.httpStatus ? `HTTP ${r.httpStatus} — ` : ''}{r.errorMessage}
                    </span>
                  );
                })()}
              </div>
            )}
          </div>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={addNew} className="w-full justify-center">
        <Plus className="h-4 w-4" /> Add AI Configuration
      </Button>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">Rule drafting</h2>
        <label className="block text-xs text-slate-500">Minimum cluster size to draft a rule</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="number" min={1} max={50} value={threshold}
            onChange={(e) => setThreshold(Math.max(1, Math.min(50, Number(e.target.value))))}
            className="w-20 rounded-[0.3rem] border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-500">transactions must agree before AI proposes a rule (1–50)</span>
          <Button
            size="sm"
            disabled={savingThreshold}
            onClick={async () => {
              setSavingThreshold(true);
              try {
                await api('/preferences', { method: 'PUT', body: JSON.stringify({ aiMiningThreshold: threshold }) });
              } finally { setSavingThreshold(false); }
            }}
          >
            {savingThreshold ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </section>
    </div>
  );
}
