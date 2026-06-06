import { apiClient } from "./api";
import type { UserRole } from "./users";
import type { Capability } from "./capabilities";

export const getRolesMatrix = () =>
  apiClient.get<{ matrix: Record<UserRole, Record<Capability, boolean>> }>("/roles/matrix");

export const setRoleOverride = (role: UserRole, capability: Capability, allowed: boolean) =>
  apiClient.put<{ ok: true }>("/roles/override", { role, capability, allowed });

export const clearRoleOverride = (role: UserRole, capability: Capability) =>
  apiClient.delete<{ ok: true }>(`/roles/override/${role}/${capability}`);
