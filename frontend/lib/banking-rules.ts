import { apiClient } from './api';
import type {
  Category, CategorisationEvent, EngineOutput, Rule, Tag, TransactionSplit,
  CategoryKind, RuleState, RuleCondition,
} from './types';

// ── Categories ──────────────────────────────────────────────────────
export const listCategories = () => apiClient.get<Category[]>('/categories');
export const createCategory = (data: { name: string; kind: CategoryKind; sortOrder?: number; isActive?: boolean; parentId?: string | null; customerId?: string | null }) =>
  apiClient.post<Category>('/categories', data);
export const updateCategory = (id: string, data: Partial<{ name: string; kind: CategoryKind; sortOrder: number; isActive: boolean; parentId: string | null; customerId: string | null }>) =>
  apiClient.patch<Category>(`/categories/${id}`, data);
export const deleteCategory = (id: string) => apiClient.delete<{ ok: true }>(`/categories/${id}`);
export const splitCategory = (id: string) =>
  apiClient.post<{ alreadyGroup: boolean; child: { id: string; name: string; parentId: string } | null; migratedCount: number }>(`/categories/${id}/split`);

// ── Tags ────────────────────────────────────────────────────────────
export const listTags = (includeInactive = false) =>
  apiClient.get<Tag[]>(`/tags${includeInactive ? '?includeInactive=true' : ''}`);
export const getTag = (id: string) => apiClient.get<Tag>(`/tags/${id}`);
export const createTag = (data: { name: string; aliases?: string[]; color?: string; notes?: string; isActive?: boolean; customerId?: string | null }) =>
  apiClient.post<Tag>('/tags', data);
export const updateTag = (id: string, data: Partial<{ name: string; aliases: string[]; color: string; notes: string; isActive: boolean; customerId: string | null }>) =>
  apiClient.patch<Tag>(`/tags/${id}`, data);
export const deleteTag = (id: string) => apiClient.delete<{ ok: true }>(`/tags/${id}`);
export const autoApplyAllTags = () => apiClient.post<{ scanned: number; applied: number }>('/tags/auto-apply', {});
export const autoApplyOneTag = (id: string) => apiClient.post<{ scanned: number; applied: number }>(`/tags/${id}/auto-apply`, {});
export const setTransactionTags = (transactionId: string, tagIds: string[]) =>
  apiClient.patch<{ ok: true; count: number }>(`/transactions/${transactionId}/tags`, { tagIds });

// ── Rules ────────────────────────────────────────────────────────────
export const listRules = (filter: { state?: RuleState[]; isActive?: boolean } = {}) => {
  const search = new URLSearchParams();
  filter.state?.forEach((s) => search.append('state', s));
  if (filter.isActive !== undefined) search.set('isActive', String(filter.isActive));
  const qs = search.toString();
  return apiClient.get<Rule[]>(`/rules${qs ? '?' + qs : ''}`);
};
export const getRule = (id: string) => apiClient.get<Rule>(`/rules/${id}`);
export const createRule = (data: { name: string; categoryId: string; noteOnApply?: string; isActive?: boolean; conditions: RuleCondition[] }) =>
  apiClient.post<Rule>('/rules', data);
export const updateRule = (id: string, data: Partial<{ name: string; categoryId: string; noteOnApply: string; isActive: boolean; conditions: RuleCondition[] }>) =>
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
  applyAutoAlias?: boolean;
}) => apiClient.post<EngineOutput>('/rule-engine/recategorise', input);

export const testRules = (input: {
  source: 'existing' | 'csv';
  csvRows?: Array<{ date: string; amount: string; description: string }>;
  accountIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  ruleIds?: string[];
}) => apiClient.post<EngineOutput>('/rule-engine/test', input);

// ── Transactions: splits + manual category ───────────────────────────
export const setTransactionSplits = (id: string, splits: TransactionSplit[]) =>
  apiClient.post<any>(`/transactions/${id}/splits`, { splits });
export const clearTransactionSplits = (id: string) =>
  apiClient.delete<any>(`/transactions/${id}/splits`);
export const setTransactionCategory = (id: string, data: { categoryId?: string; notes?: string }) =>
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
