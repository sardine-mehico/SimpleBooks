import { apiClient } from "./api";

export type RetentionTable =
  | "AuditLog" | "TransactionImport" | "AllocationEvent"
  | "CategorisationEvent" | "AiCall" | "Session";

export const retentionStats = () =>
  apiClient.get<Record<string, { count: number; oldestAt: string | null }>>("/data-retention/stats");

export const retentionPurge = (table: RetentionTable, age: "7d" | "30d" | "90d" | "1y" | "all") =>
  apiClient.post<{ deleted: number }>("/data-retention/purge", { table, age });
