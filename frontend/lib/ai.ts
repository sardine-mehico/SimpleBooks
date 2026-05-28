// frontend/lib/ai.ts
import { api } from './api';
import type { AiDraftView, BulkRunStatus, MineRulesResult, SuggestResult } from './types';

export function suggestCategory(transactionId: string, opts: { force?: boolean } = {}) {
  return api<SuggestResult>('/ai/suggest-category', { method: 'POST', body: JSON.stringify({ transactionId, ...opts }) });
}

export type ApplyDecision =
  | { action: 'accept' }
  | { action: 'edit'; chosenCategoryId: string }
  | { action: 'reject' };

export function applyAiSuggestion(transactionId: string, decision: ApplyDecision) {
  return api<void>('/ai/apply', { method: 'POST', body: JSON.stringify({ transactionId, decision }) });
}

export function bulkSuggest(query: { accountIds?: string[]; dateFrom?: string; dateTo?: string; scope?: 'uncategorised' | 'all'; transactionIds?: string[]; force?: boolean }) {
  return api<{ runId: string; totalQueued: number }>('/ai/bulk-suggest', { method: 'POST', body: JSON.stringify(query) });
}

export function bulkSuggestStatus(runId: string) {
  return api<BulkRunStatus>(`/ai/bulk-suggest/${runId}/status`);
}

export function bulkSuggestCancel(runId: string) {
  return api<void>(`/ai/bulk-suggest/${runId}/cancel`, { method: 'POST' });
}

export type ActiveBulkQueue = {
  runId: string | null;
  totals: { totalQueued: number; done: number; ok: number; cached: number; failed: number };
  pending: Array<{ id: string; date: string; amount: string; description: string; accountName: string | null }>;
  pendingCount: number;
};

export function getActiveBulkQueue() {
  return api<ActiveBulkQueue>('/ai/bulk-suggest/active');
}

export function cancelActiveBulkQueue() {
  return api<{ runId: string | null; cancelled: number }>('/ai/bulk-suggest/active/cancel', { method: 'POST' });
}

export function listReviewQueue() {
  return api<AiDraftView[]>('/ai/review-queue');
}

export function reviewQueueCount() {
  return api<{ count: number }>('/ai/review-queue/count');
}

export function mineRules() {
  return api<MineRulesResult>('/ai/mine-rules', { method: 'POST' });
}
