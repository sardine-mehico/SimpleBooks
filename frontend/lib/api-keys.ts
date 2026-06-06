import { apiClient } from "./api";

export type ApiKeyRow = {
  id: string;
  userId: string;
  label: string;
  prefix: string;
  suffix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  user: { id: string; username: string; displayName: string; role: string };
};

export const listApiKeys = () => apiClient.get<ApiKeyRow[]>("/api-keys");
export const createApiKey = (data: { userId: string; label: string; expiresAt?: string }) =>
  apiClient.post<ApiKeyRow & { secret: string }>("/api-keys", data);
export const revokeApiKey = (id: string) => apiClient.delete<{ id: string }>(`/api-keys/${id}`);
