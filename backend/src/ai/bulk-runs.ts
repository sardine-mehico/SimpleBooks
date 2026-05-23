// backend/src/ai/bulk-runs.ts
// In-memory map of bulk-suggest run state. Crashes lose state; the per-transaction
// events are the durable record.
export interface BulkRun {
  id: string;
  totalQueued: number;
  done: number;
  ok: number;
  cached: number;
  failed: number;
  cancelled: boolean;
  createdAt: number;
  abort: AbortController;
  lastError?: string;   // verbatim message from the most recent failure
}

const runs = new Map<string, BulkRun>();

export const BulkRuns = {
  create(id: string, totalQueued: number): BulkRun {
    const run: BulkRun = {
      id, totalQueued, done: 0, ok: 0, cached: 0, failed: 0,
      cancelled: false, createdAt: Date.now(), abort: new AbortController(),
    };
    runs.set(id, run);
    return run;
  },
  get(id: string): BulkRun | undefined { return runs.get(id); },
  cancel(id: string) {
    const r = runs.get(id);
    if (r) { r.cancelled = true; r.abort.abort(); }
  },
  delete(id: string) { runs.delete(id); },
  // Sweep runs older than 1 hour
  sweep() {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, r] of runs) if (r.createdAt < cutoff) runs.delete(id);
  },
};
