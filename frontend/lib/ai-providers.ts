import { apiClient } from './api';
import type { AiProvider } from './types';

export const listAiProviders = () => apiClient.get<AiProvider[]>('/ai-providers');
export const createAiProvider = (data: { name: string; model: string; apiBaseUrl: string; apiKey: string; isPrimary?: boolean; requestsPerMinute?: number }) =>
  apiClient.post<AiProvider>('/ai-providers', data);
export const updateAiProvider = (id: string, data: Partial<{ name: string; model: string; apiBaseUrl: string; apiKey: string; requestsPerMinute: number }>) =>
  apiClient.patch<AiProvider>(`/ai-providers/${id}`, data);
export const setAiProviderPrimary = (id: string) =>
  apiClient.patch<AiProvider>(`/ai-providers/${id}/set-primary`, {});
export const deleteAiProvider = (id: string) =>
  apiClient.delete<{ ok: true }>(`/ai-providers/${id}`);
export const moveAiProvider = (id: string, direction: 'up' | 'down') =>
  apiClient.patch(`/ai-providers/${id}/move`, { direction });

export interface ProviderTestResult {
  ok: boolean;
  httpStatus?: number;
  latencyMs: number;
  errorMessage?: string;
  modelEcho?: string;
  preview?: string;
}

export function testAiProvider(id: string) {
  return apiClient.post<ProviderTestResult>(`/ai-providers/${id}/test`);
}
