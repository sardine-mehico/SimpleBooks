const isServer = typeof window === "undefined";
const SERVER_URL = process.env.NEXT_PUBLIC_API_URL_INTERNAL || "http://backend:4000";
const BROWSER_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const apiBase = () => (isServer ? SERVER_URL : BROWSER_URL);

// Use for URLs that will be followed by the user's browser (anchor hrefs,
// window.open, image src, etc) — never for server-side fetch. `apiBase()`
// is context-sensitive and during SSR returns the in-compose hostname
// (`http://backend:4000`), which a customer's browser can't resolve. This
// helper is always the public, browser-reachable URL.
export const browserApiBase = () => BROWSER_URL;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T,>(path: string) => api<T>(path),
  post: <T,>(path: string, body: any) => api<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T,>(path: string, body: any) => api<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T,>(path: string, body: any) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  // DELETE accepts an optional body — used by the destructive-confirmation
  // flow that captures a "reason to delete" alongside the request.
  delete: <T,>(path: string, body?: any) =>
    api<T>(path, {
      method: "DELETE",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
};
