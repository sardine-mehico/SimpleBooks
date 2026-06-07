import { apiClient } from "./api";

export type RetentionTable =
  | "AuditLog" | "TransactionImport" | "AllocationEvent"
  | "CategorisationEvent" | "AiCall" | "Session";

export type RetentionAge = "7d" | "30d" | "90d" | "1y";

export type RetentionPolicy = {
  table: RetentionTable;
  cutoffAge: RetentionAge;
  enabled: boolean;
  lastRunAt: string | null;
};

export const retentionStats = () =>
  apiClient.get<Record<string, { count: number; oldestAt: string | null }>>("/data-retention/stats");

export const retentionPurge = (table: RetentionTable, age: RetentionAge | "all") =>
  apiClient.post<{ deleted: number }>("/data-retention/purge", { table, age });

export const retentionPolicies = () =>
  apiClient.get<RetentionPolicy[]>("/data-retention/policies");

export const retentionUpsertPolicy = (
  table: RetentionTable,
  body: { cutoffAge: RetentionAge; enabled: boolean },
) => apiClient.put<RetentionPolicy>(`/data-retention/policies/${table}`, body);
