import { apiClient } from './api';
import type {
  Category, CategorisationEvent, EngineOutput, Rule, TransactionSplit,
  Vendor, VendorExtractionCandidate, VendorKind, CategoryKind, RuleState, RuleCondition,
} from './types';

// ── Categories ──────────────────────────────────────────────────────
export const listCategories = () => apiClient.get<Category[]>('/categories');
export const createCategory = (data: { name: string; kind: CategoryKind; sortOrder?: number; isActive?: boolean; parentId?: string | null }) =>
  apiClient.post<Category>('/categories', data);
export const updateCategory = (id: string, data: Partial<{ name: string; kind: CategoryKind; sortOrder: number; isActive: boolean; parentId: string | null }>) =>
  apiClient.patch<Category>(`/categories/${id}`, data);
export const deleteCategory = (id: string) => apiClient.delete<{ ok: true }>(`/categories/${id}`);
export const splitCategory = (id: string) =>
  apiClient.post<{ alreadyGroup: boolean; child: { id: string; name: string; parentId: string } | null; migratedCount: number }>(`/categories/${id}/split`);

// ── Vendors ──────────────────────────────────────────────────────────
export const listVendors = (includeInactive = false) =>
  apiClient.get<Vendor[]>(`/vendors${includeInactive ? '?includeInactive=true' : ''}`);
export const getVendor = (id: string) => apiClient.get<Vendor>(`/vendors/${id}`);
export const createVendor = (data: { name: string; kind: VendorKind; aliases: string[]; notes?: string; isActive?: boolean; customerId?: string }) =>
  apiClient.post<Vendor>('/vendors', data);
export const updateVendor = (id: string, data: Partial<{ name: string; kind: VendorKind; aliases: string[]; notes: string; isActive: boolean; customerId: string }>) =>
  apiClient.patch<Vendor>(`/vendors/${id}`, data);
export const deleteVendor = (id: string) => apiClient.delete<{ ok: true }>(`/vendors/${id}`);

export const extractVendorCandidates = (input: { source: 'all-transactions' | 'csv'; csvBase64?: string; dateFrom?: string; dateTo?: string; accountIds?: string[] }) =>
  apiClient.post<VendorExtractionCandidate[]>('/vendors/extract', input);
export const commitVendorCandidates = (candidates: Array<{ name: string; kind: VendorKind; aliases: string[] }>) =>
  apiClient.post<{ created: number; updated: number; skipped: number }>('/vendors/extract/commit', { candidates });

// ── Rules ────────────────────────────────────────────────────────────
export const listRules = (filter: { state?: RuleState[]; isActive?: boolean } = {}) => {
  const search = new URLSearchParams();
  filter.state?.forEach((s) => search.append('state', s));
  if (filter.isActive !== undefined) search.set('isActive', String(filter.isActive));
  const qs = search.toString();
  return apiClient.get<Rule[]>(`/rules${qs ? '?' + qs : ''}`);
};
export const getRule = (id: string) => apiClient.get<Rule>(`/rules/${id}`);
export const createRule = (data: { name: string; categoryId: string; vendorId?: string; noteOnApply?: string; isActive?: boolean; conditions: RuleCondition[] }) =>
  apiClient.post<Rule>('/rules', data);
export const updateRule = (id: string, data: Partial<{ name: string; categoryId: string; vendorId: string; noteOnApply: string; isActive: boolean; conditions: RuleCondition[] }>) =>
  apiClient.patch<Rule>(`/rules/${id}`, data);
export const deleteRule = (id: string) => apiClient.delete<{ ok: true }>(`/rules/${id}`);
export const moveRule = (id: string, direction: 'up' | 'down') =>
  apiClient.patch<Rule>(`/rules/${id}/move`, { direction });
export const setRuleState = (id: string, state: RuleState) =>
  apiClient.patch<Rule>(`/rules/${id}/state`, { state });
export const toggleRuleActive = (id: string, isActive: boolean) =>
  apiClient.patch<Rule>(`/rules/${id}/toggle-active`, { isActive });

// ── Rule engine ──────────────────────────────────────────────────────
export const recategorise = (input: {
  scope: 'uncategorised' | 'all';
  accountIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  preserveSplits?: boolean;
  applyVendorMatch?: boolean;
}) => apiClient.post<EngineOutput>('/rule-engine/recategorise', input);

export const testRules = (input: {
  source: 'existing' | 'csv';
  csvRows?: Array<{ date: string; amount: string; description: string }>;
  accountIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  ruleIds?: string[];
  applyVendorMatch?: boolean;
}) => apiClient.post<EngineOutput>('/rule-engine/test', input);

// ── Transactions: splits + manual category ───────────────────────────
export const setTransactionSplits = (id: string, splits: TransactionSplit[]) =>
  apiClient.post<any>(`/transactions/${id}/splits`, { splits });
export const clearTransactionSplits = (id: string) =>
  apiClient.delete<any>(`/transactions/${id}/splits`);
export const setTransactionCategory = (id: string, data: { categoryId?: string; vendorId?: string; notes?: string }) =>
  apiClient.patch<any>(`/transactions/${id}/category`, data);

// ── Categorisation events ────────────────────────────────────────────
export const listCategorisationEvents = (params: { transactionId?: string; source?: string; limit?: number } = {}) => {
  const search = new URLSearchParams();
  if (params.transactionId) search.set('transactionId', params.transactionId);
  if (params.source) search.set('source', params.source);
  if (params.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiClient.get<CategorisationEvent[]>(`/categorisation-events${qs ? '?' + qs : ''}`);
};
