import { apiClient } from './api';
import type { ReportResponse } from './types';

function buildQuery(params: { from: string; to: string; accountIds?: string[] }): string {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.accountIds !== undefined) {
    q.set('accountIds', params.accountIds.join(','));
  }
  return q.toString();
}

export const getExpenseReport = (params: { from: string; to: string; accountIds?: string[] }) =>
  apiClient.get<ReportResponse>(`/reports/expense?${buildQuery(params)}`);

export const getIncomeReport = (params: { from: string; to: string; accountIds?: string[] }) =>
  apiClient.get<ReportResponse>(`/reports/income?${buildQuery(params)}`);
