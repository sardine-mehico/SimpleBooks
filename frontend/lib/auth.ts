import { api, apiBase } from "./api";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "ACCOUNTANT" | "BOOKKEEPER" | "API_USER";
};

export const LANDING_BY_ROLE: Record<AuthUser["role"], string> = {
  ADMIN: "/",
  ACCOUNTANT: "/invoices",
  BOOKKEEPER: "/invoices",
  API_USER: "/invoices",
};

// Browser-side login. Always uses the browser URL so the session cookie is
// set on the right origin. `credentials: 'include'` is required for the
// cookie to be sent on subsequent fetches (paired with backend CORS
// credentials: true).
export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${apiBase()}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let msg = "Login failed.";
    try {
      const body = await res.json();
      if (typeof body?.message === "string") msg = body.message;
      else if (Array.isArray(body?.message)) msg = body.message.join(". ");
    } catch {}
    throw new Error(msg);
  }
  const json = await res.json();
  return json.user as AuthUser;
}

export async function logout(): Promise<void> {
  await fetch(`${apiBase()}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
}

// Browser-only — server-side rendering should use the backend session
// validator directly, not this. Returns null if not logged in.
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${apiBase()}/auth/me`, { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.user as AuthUser;
  } catch {
    return null;
  }
}
