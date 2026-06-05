/* SimpleBooks service worker
 * Strategy:
 *   - /_next/static/* and /icon*, /apple-icon*, /manifest.webmanifest:
 *     cache-first (immutable, long-lived).
 *   - HTML navigation requests: network-first, fall back to cached shell
 *     so the app opens offline (shows last-good page).
 *   - /api/* and other dynamic fetches: network-only, never cached. Auth /
 *     mutation state is too sensitive to stale-serve.
 * Bump CACHE_VERSION on every release so old caches get purged.
 */
const CACHE_VERSION = "sb-v0.5";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

const STATIC_PREFIXES = ["/_next/static/", "/icon", "/apple-icon", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isStatic(url) {
  return STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the API.
  if (url.pathname.startsWith("/api/")) return;

  // Static immutable: cache-first.
  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // HTML navigation: network-first, fall back to cached shell.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const hit = await cache.match(req);
          if (hit) return hit;
          const fallback = await cache.match("/");
          if (fallback) return fallback;
          return new Response("Offline — no cached copy available.", {
            status: 503,
            headers: { "content-type": "text/plain" },
          });
        }
      })()
    );
  }
});
