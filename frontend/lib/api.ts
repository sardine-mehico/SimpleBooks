// URLs are resolved at RUNTIME, not baked into the bundle, so the same
// Docker image works for any domain. The root layout injects
// `window.__SB_CONFIG__` from process.env on the server; browser reads it.
//
// Server-side (SSR inside the frontend container): reads API_URL_INTERNAL
// straight from process.env at request time, defaulting to the compose
// service name `http://backend:4000`.
//
// Browser-side: reads `window.__SB_CONFIG__.apiUrl` injected by the root
// layout, defaulting to localhost so `next dev` works out of the box.

declare global {
  interface Window {
    __SB_CONFIG__?: { apiUrl?: string };
  }
}

const isServer = typeof window === "undefined";

function serverUrl(): string {
  return (
    process.env.API_URL_INTERNAL ||
    process.env.NEXT_PUBLIC_API_URL_INTERNAL ||
    "http://backend:4000"
  );
}

function browserUrl(): string {
  const configured =
    (typeof window !== "undefined" && window.__SB_CONFIG__?.apiUrl) || "http://localhost:4000";
  // If config points at localhost but the page itself was loaded from a
  // different host (LAN IP, phone over Wi-Fi, etc.), swap the hostname so
  // fetches still hit the same machine the page came from.
  if (typeof location !== "undefined" && location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    try {
      const u = new URL(configured);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        u.hostname = location.hostname;
        return u.toString().replace(/\/$/, "");
      }
    } catch {}
  }
  return configured;
}

export const apiBase = () => (isServer ? serverUrl() : browserUrl());

// Use for URLs that will be followed by the user's browser (anchor hrefs,
// window.open, image src, etc) — never for server-side fetch. `apiBase()`
// is context-sensitive and during SSR returns the in-compose hostname
// (`http://backend:4000`), which a customer's browser can't resolve. This
// helper is always the public, browser-reachable URL.
export const browserApiBase = () => browserUrl();

// Structured error so callers can branch on status (esp. 412 Precondition
// Failed for ETag conflicts). The legacy `Error` shape is preserved via the
// message so existing `e?.message`-based catches still work.
export class ApiError extends Error {
  constructor(public status: number, public path: string, public body: string) {
    super(`${status} ${path}: ${body}`);
    this.name = "ApiError";
  }
  // Convenience for the most common case in forms.
  get isPreconditionFailed() {
    return this.status === 412;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const extraHeaders: Record<string, string> = {};
  // SSR path: `credentials: include` does nothing on the server. To call
  // an authenticated backend endpoint during page render we must read the
  // browser's request cookie via next/headers and forward it as a header.
  // Without this, every authenticated server component renders empty
  // (silent 401 caught by the page-level .catch fallbacks).
  if (isServer) {
    try {
      // Dynamic-require so this module stays loadable in non-Next contexts
      // (e.g. lib/auth.ts on the client). next/headers is async in 15.
      const { cookies } = await import("next/headers");
      const jar = await cookies();
      const tok = jar.get("sb_session")?.value;
      if (tok) extraHeaders["cookie"] = `sb_session=${tok}`;
    } catch {
      // Not running inside a Next request (build, script). Continue
      // unauthenticated — the catch on the caller covers it.
    }
  }
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    // credentials: 'include' makes the BROWSER send the sb_session cookie
    // alongside cross-origin fetches (frontend and backend on different
    // ports in dev / same domain in prod). On the server, the cookie is
    // forwarded explicitly via the extraHeaders block above.
    credentials: "include",
    headers: { "content-type": "application/json", ...extraHeaders, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // SSR 401 handling: a stale session cookie (e.g. survived a DB wipe
    // that cleared the Session table) gets past `middleware.ts` because
    // middleware can only check that the cookie EXISTS, not that the
    // backend still recognises it. Without this branch, every authed
    // server component throws ApiError(401) and Next.js renders a generic
    // "Application error" page with no path back to login. Redirecting
    // forces a fresh login. `redirect()` throws a NEXT_REDIRECT signal
    // which Next.js catches up the stack — do NOT wrap it in try/catch
    // or the signal gets swallowed and the redirect never happens.
    if (isServer && res.status === 401) {
      const nav = await import("next/navigation").catch(() => null);
      if (nav) nav.redirect("/login");
    }
    throw new ApiError(res.status, path, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// PATCH/PUT options bag — `ifMatch` is the ETag captured from the form's
// initial load (or the previous successful PATCH response). When set, the
// server enforces optimistic concurrency; mismatch yields a 412 ApiError.
export interface MutateOpts {
  ifMatch?: string;
}

function withIfMatch(init: RequestInit, opts?: MutateOpts): RequestInit {
  if (!opts?.ifMatch) return init;
  return { ...init, headers: { ...init.headers, "If-Match": opts.ifMatch } };
}

export const apiClient = {
  get: <T,>(path: string) => api<T>(path),
  post: <T,>(path: string, body: any) =>
    api<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T,>(path: string, body: any, opts?: MutateOpts) =>
    api<T>(path, withIfMatch({ method: "PUT", body: JSON.stringify(body) }, opts)),
  patch: <T,>(path: string, body: any, opts?: MutateOpts) =>
    api<T>(path, withIfMatch({ method: "PATCH", body: JSON.stringify(body) }, opts)),
  // DELETE accepts an optional body — used by the destructive-confirmation
  // flow that captures a "reason to delete" alongside the request.
  delete: <T,>(path: string, body?: any) =>
    api<T>(path, {
      method: "DELETE",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
};

// Helper: build an ETag value from an entity's updatedAt. The backend's
// EtagInterceptor uses the same shape so the strings line up exactly.
export function etagFor(updatedAt: string | Date | null | undefined): string | undefined {
  if (!updatedAt) return undefined;
  const iso = typeof updatedAt === "string" ? updatedAt : updatedAt.toISOString();
  return `"${iso}"`;
}

// Multipart helper for CSV import endpoints. `formData` is constructed by the
// caller (browser-side only — these endpoints are never hit during SSR).
export async function apiMultipart<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { method: 'POST', body: formData, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, path, body);
  }
  return res.json() as Promise<T>;
}
