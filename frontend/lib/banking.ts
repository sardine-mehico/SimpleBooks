import { apiClient, apiMultipart } from './api';
import type {
  Account, AccountType, ColumnMapping, ImportLogFull, ImportLogSummary,
  ImportReport, SniffResponse, Transaction, TransactionListResponse,
} from './types';

// Accounts
export const listAccounts = (includeInactive = false) =>
  apiClient.get<Account[]>(`/accounts${includeInactive ? '?includeInactive=true' : ''}`);
export const getAccount = (id: string) => apiClient.get<Account>(`/accounts/${id}`);
export const createAccount = (data: any) => apiClient.post<Account>('/accounts', data);
export const updateAccount = (id: string, data: any) => apiClient.patch<Account>(`/accounts/${id}`, data);
export const archiveAccount = (id: string) => apiClient.patch<Account>(`/accounts/${id}/archive`, {});
export const restoreAccount = (id: string) => apiClient.patch<Account>(`/accounts/${id}/restore`, {});

// AccountTypes
export const listAccountTypes = () => apiClient.get<AccountType[]>('/account-types');
export const createAccountType = (data: { name: string; isActive?: boolean }) =>
  apiClient.post<AccountType>('/account-types', data);
export const updateAccountType = (id: string, data: { name?: string; isActive?: boolean }) =>
  apiClient.patch<AccountType>(`/account-types/${id}`, data);
export const deleteAccountType = (id: string) => apiClient.delete<{ ok: true }>(`/account-types/${id}`);

// Transactions
export const listTransactions = (params: {
  accountIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  categoryId?: string;
  categoryUncategorised?: boolean;
  categoryKind?: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'OTHER';
  vendorId?: string;
  vendorNone?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}) => {
  const search = new URLSearchParams();
  if (params.accountIds?.length) search.set('accountIds', params.accountIds.join(','));
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  if (params.q) search.set('q', params.q);
  if (params.categoryId) search.set('categoryId', params.categoryId);
  if (params.categoryUncategorised) search.set('categoryUncategorised', 'true');
  if (params.categoryKind) search.set('categoryKind', params.categoryKind);
  if (params.vendorId) search.set('vendorId', params.vendorId);
  if (params.vendorNone) search.set('vendorNone', 'true');
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortDir) search.set('sortDir', params.sortDir);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  return apiClient.get<TransactionListResponse>(`/transactions${qs ? '?' + qs : ''}`);
};

export const getTransactionStats = (accountIds?: string[]) => {
  const qs = accountIds?.length ? `?accountIds=${accountIds.join(',')}` : '';
  return apiClient.get<{ total: number; categorised: number; uncategorised: number }>(`/transactions/stats${qs}`);
};

// CSV import
export const sniffCsv = (file: File, accountId: string) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('accountId', accountId);
  return apiMultipart<SniffResponse>('/transaction-imports/sniff', fd);
};
export const commitImport = (
  file: File,
  accountId: string,
  fileSha256: string,
  mapping: ColumnMapping,
  applyRules = false,
) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('accountId', accountId);
  fd.append('fileSha256', fileSha256);
  fd.append('mapping', JSON.stringify(mapping));
  fd.append('filename', file.name);
  fd.append('applyRules', applyRules ? 'true' : 'false');
  return apiMultipart<ImportReport>('/transaction-imports/commit', fd);
};

// Import logs
export const listImportLogs = (params: { accountId?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number } = {}) => {
  const search = new URLSearchParams();
  if (params.accountId) search.set('accountId', params.accountId);
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  return apiClient.get<{ items: ImportLogSummary[]; totalCount: number }>(`/import-logs${qs ? '?' + qs : ''}`);
};
export const getImportLog = (id: string) => apiClient.get<ImportLogFull>(`/import-logs/${id}`);
