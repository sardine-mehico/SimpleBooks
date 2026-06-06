import { apiClient } from "./api";

export type AuditAction =
  | "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "LOGOUT"
  | "USER_CREATED" | "USER_UPDATED" | "USER_DELETED"
  | "ROLE_CHANGED" | "ROLE_OVERRIDE_CHANGED"
  | "API_KEY_CREATED" | "API_KEY_REVOKED"
  | "RESOURCE_DELETED" | "DATA_RETENTION_PURGE";

export type AuditRow = {
  id: string;
  action: AuditAction;
  actorId: string | null;
  actor: { id: string; username: string; displayName: string; role: string } | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
};

export const listAudit = (params: { action?: AuditAction; from?: string; to?: string; take?: number } = {}) => {
  const q = new URLSearchParams();
  if (params.action) q.set("action", params.action);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.take) q.set("take", String(params.take));
  return apiClient.get<AuditRow[]>(`/audit?${q.toString()}`);
};

export const auditStats = () => apiClient.get<{ count: number; oldestAt: string | null }>("/audit/stats");
