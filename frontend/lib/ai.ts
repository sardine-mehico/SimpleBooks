// frontend/lib/ai.ts
import { api } from './api';
import type { AiDraftView, BulkRunStatus, MineRulesResult, SuggestResult } from './types';

export function suggestCategory(transactionId: string, opts: { force?: boolean } = {}) {
  return api<SuggestResult>('/ai/suggest-category', { method: 'POST', body: JSON.stringify({ transactionId, ...opts }) });
}

export type ApplyDecision =
  | { action: 'accept' }
  | { action: 'edit'; chosenCategoryId: string; chosenVendorId?: string | null }
  | { action: 'reject' };

export function applyAiSuggestion(transactionId: string, decision: ApplyDecision) {
  return api<void>('/ai/apply', { method: 'POST', body: JSON.stringify({ transactionId, decision }) });
}

export function bulkSuggest(query: { accountIds?: string[]; dateFrom?: string; dateTo?: string; scope: 'uncategorised' | 'all' }) {
  return api<{ runId: string; totalQueued: number }>('/ai/bulk-suggest', { method: 'POST', body: JSON.stringify(query) });
}

export function bulkSuggestStatus(runId: string) {
  return api<BulkRunStatus>(`/ai/bulk-suggest/${runId}/status`);
}

export function bulkSuggestCancel(runId: string) {
  return api<void>(`/ai/bulk-suggest/${runId}/cancel`, { method: 'POST' });
}

export function listReviewQueue() {
  return api<AiDraftView[]>('/ai/review-queue');
}

export function mineRules() {
  return api<MineRulesResult>('/ai/mine-rules', { method: 'POST' });
}
