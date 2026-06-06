// In-process IP rate limiter for the /auth/login endpoint. Acts in front of
// the per-user lockout (tracked on the User row via failedLoginAttempts +
// lockedUntil) — IP rate-limit stops a brute-force from cycling usernames.
//
// 5 fails in 10 minutes → block this IP for the rest of the window.
// Memory cost: ~100 bytes per IP. Reset on backend restart.

const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 5;

type Entry = { count: number; windowStart: number };
const ipFails = new Map<string, Entry>();

export function recordLoginFailure(ip: string): { blocked: boolean; remainingMs: number } {
  const now = Date.now();
  const e = ipFails.get(ip);
  if (!e || now - e.windowStart > WINDOW_MS) {
    ipFails.set(ip, { count: 1, windowStart: now });
    return { blocked: false, remainingMs: 0 };
  }
  e.count += 1;
  if (e.count >= MAX_FAILS) {
    return { blocked: true, remainingMs: WINDOW_MS - (now - e.windowStart) };
  }
  return { blocked: false, remainingMs: 0 };
}

export function isIpBlocked(ip: string): { blocked: boolean; remainingMs: number } {
  const now = Date.now();
  const e = ipFails.get(ip);
  if (!e) return { blocked: false, remainingMs: 0 };
  if (now - e.windowStart > WINDOW_MS) {
    ipFails.delete(ip);
    return { blocked: false, remainingMs: 0 };
  }
  if (e.count >= MAX_FAILS) {
    return { blocked: true, remainingMs: WINDOW_MS - (now - e.windowStart) };
  }
  return { blocked: false, remainingMs: 0 };
}

export function clearLoginFailures(ip: string): void {
  ipFails.delete(ip);
}
