import { apiClient } from "./api";

export type UserRole = "ADMIN" | "ACCOUNTANT" | "BOOKKEEPER" | "API_USER";

export type UserRow = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  createdAt: string;
  updatedAt: string;
};

export const listUsers = () => apiClient.get<UserRow[]>("/users");
export const getUser = (id: string) => apiClient.get<UserRow>(`/users/${id}`);

export type CreateUserPayload = {
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
  password?: string;
  isActive?: boolean;
};
export const createUser = (data: CreateUserPayload) => apiClient.post<UserRow>("/users", data);

export type UpdateUserPayload = Partial<{
  displayName: string;
  email: string;
  role: UserRole;
  password: string;
  isActive: boolean;
}>;
export const updateUser = (id: string, data: UpdateUserPayload) =>
  apiClient.patch<UserRow>(`/users/${id}`, data);

export const deleteUser = (id: string) => apiClient.delete<{ id: string }>(`/users/${id}`);
