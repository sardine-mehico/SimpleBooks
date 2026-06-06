import { apiClient } from './api';
import type { ReportResponse, CashflowResponse } from './types';

export type TagsReportRow = {
  id: string;
  name: string;
  color: string | null;
  total: string;
  count: number;
};

export type TagsReportResponse = {
  kind: 'EXPENSE' | 'INCOME';
  from: string;
  to: string;
  accountIds: string[] | null;
  dedupTotal: string;
  dedupCount: number;
  untaggedTotal: string;
  untaggedCount: number;
  taggedTotal: string;
  taggedCount: number;
  tags: TagsReportRow[];
  sumOfTagTotals: string;
  overlapTotal: string;
};

function buildQuery(params: { from: string; to: string; accountIds?: string[]; tagIds?: string[] }): string {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.accountIds !== undefined) {
    q.set('accountIds', params.accountIds.join(','));
  }
  if (params.tagIds !== undefined && params.tagIds.length > 0) {
    q.set('tagIds', params.tagIds.join(','));
  }
  return q.toString();
}

export const getExpenseReport = (params: { from: string; to: string; accountIds?: string[]; tagIds?: string[] }) =>
  apiClient.get<ReportResponse>(`/reports/expense?${buildQuery(params)}`);

export const getIncomeReport = (params: { from: string; to: string; accountIds?: string[]; tagIds?: string[] }) =>
  apiClient.get<ReportResponse>(`/reports/income?${buildQuery(params)}`);

export const getTagsReport = (params: { kind: 'EXPENSE' | 'INCOME'; from: string; to: string; accountIds?: string[] }) => {
  const q = new URLSearchParams({ kind: params.kind, from: params.from, to: params.to });
  if (params.accountIds !== undefined) q.set('accountIds', params.accountIds.join(','));
  return apiClient.get<TagsReportResponse>(`/reports/tags?${q.toString()}`);
};

export const getCashflow = (params: { from: string; to: string; accountIds?: string[] }) => {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.accountIds !== undefined) q.set('accountIds', params.accountIds.join(','));
  return apiClient.get<CashflowResponse>(`/reports/cashflow?${q.toString()}`);
};
