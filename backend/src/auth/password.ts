import * as argon2 from 'argon2';
import { timingSafeEqual, randomBytes } from 'crypto';

const ARGON_OPTS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  // OWASP 2024 recommendation for argon2id:
  // memoryCost: 19 MiB, timeCost: 2, parallelism: 1
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// Constant-time comparison for the env-admin path. The env password is read
// as plain text; we compare it byte-by-byte without leaking timing info.
export function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Burn a constant amount of time even on length mismatch.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

// 32-byte URL-safe random — used for session cookies and API key secrets.
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
