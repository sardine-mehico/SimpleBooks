import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword, timingSafeStringEqual, randomToken } from './password';
import { isIpBlocked, recordLoginFailure, clearLoginFailures } from './rate-limit';
import { AuditService } from '../audit/audit.service';

// Per-user lockout (independent of the IP rate limit): 5 fails → 30min lock.
const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 30 * 60_000;

// Session lifetime: 7 days sliding (refreshed on every authenticated request
// that lands within the last day of validity).
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60_000;
const SESSION_REFRESH_THRESHOLD_MS = 24 * 60 * 60_000;

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: 'ADMIN' | 'ACCOUNTANT' | 'BOOKKEEPER' | 'API_USER';
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Bootstrap the env-driven admin row. Refuses to start without both env
  // vars (so the app can never accidentally boot without auth).
  async onModuleInit(): Promise<void> {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password) {
      console.error(
        '[FATAL] SimpleBooks cannot start without ADMIN_USERNAME and ADMIN_PASSWORD ' +
          'env vars. Set both in your .env / compose env block. The env credentials ' +
          'are the canonical admin login and remain valid for the lifetime of the deploy.',
      );
      process.exit(1);
    }
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (!existing) {
      await this.prisma.user.create({
        data: {
          username,
          displayName: 'Administrator',
          role: 'ADMIN',
          passwordHash: null,
          isActive: true,
        },
      });
      console.log(`[auth] bootstrapped env admin user: ${username}`);
    } else if (existing.role !== 'ADMIN' || !existing.isActive) {
      // Reconcile — the env admin must always be ACTIVE + ADMIN.
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { role: 'ADMIN', isActive: true, lockedUntil: null, failedLoginAttempts: 0 },
      });
      console.log(`[auth] reconciled env admin user: ${username}`);
    }

    // Daily sweep of expired sessions.
    setInterval(() => this.purgeExpiredSessions(), 60 * 60_000).unref?.();
  }

  // ── Login ────────────────────────────────────────────────────────────────

  async login(
    username: string,
    password: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<{ token: string; user: AuthUser }> {
    const ipState = isIpBlocked(ip);
    if (ipState.blocked) {
      throw new UnauthorizedException(
        `Too many failed attempts from this IP. Try again in ${Math.ceil(ipState.remainingMs / 60_000)} min.`,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      recordLoginFailure(ip);
      void this.audit.record({
        action: 'LOGIN_FAILURE', ipAddress: ip, userAgent,
        metadata: { username, reason: user ? 'inactive' : 'not_found' },
      });
      throw new UnauthorizedException('Invalid username or password.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minsLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(
        `Account is locked. Try again in ${minsLeft} min.`,
      );
    }

    // Validate password.
    const envUsername = process.env.ADMIN_USERNAME;
    const envPassword = process.env.ADMIN_PASSWORD;
    let valid = false;
    if (user.username === envUsername && envPassword) {
      // Env-admin path: compare against env vars directly. The DB row has no
      // passwordHash; the env value is canonical for the lifetime of the deploy.
      valid = timingSafeStringEqual(password, envPassword);
    } else if (user.passwordHash) {
      valid = await verifyPassword(user.passwordHash, password);
    }

    if (!valid) {
      const ipResult = recordLoginFailure(ip);
      void this.audit.record({
        action: 'LOGIN_FAILURE', actorId: user.id, ipAddress: ip, userAgent,
        metadata: { username, reason: 'bad_password' },
      });
      const failedNow = user.failedLoginAttempts + 1;
      const updates: { failedLoginAttempts: number; lockedUntil?: Date } = {
        failedLoginAttempts: failedNow,
      };
      if (failedNow >= LOCK_THRESHOLD) {
        updates.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      }
      await this.prisma.user.update({ where: { id: user.id }, data: updates });
      if (ipResult.blocked) {
        throw new UnauthorizedException(
          `Too many failed attempts. Try again in ${Math.ceil(ipResult.remainingMs / 60_000)} min.`,
        );
      }
      throw new UnauthorizedException('Invalid username or password.');
    }

    // Success — clear counters, mint session.
    clearLoginFailures(ip);
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      }),
      this.prisma.session.create({
        data: { userId: user.id, token, ipAddress: ip, userAgent, expiresAt },
      }),
    ]);
    void this.audit.record({
      action: 'LOGIN_SUCCESS', actorId: user.id, ipAddress: ip, userAgent,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  // ── Session validation ───────────────────────────────────────────────────

  // Used by the SessionGuard on every request. Returns the authenticated
  // user or null if the session is missing/expired/revoked. Slides the
  // expiry forward when the session is in its last day.
  async validateSession(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    if (!session.user.isActive) return null;
    // Sliding expiry: bump if we're inside the last refresh window.
    const remaining = session.expiresAt.getTime() - Date.now();
    if (remaining < SESSION_REFRESH_THRESHOLD_MS) {
      const newExpiry = new Date(Date.now() + SESSION_LIFETIME_MS);
      await this.prisma.session.update({ where: { id: session.id }, data: { expiresAt: newExpiry } });
    }
    return {
      id: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      role: session.user.role,
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const session = await this.prisma.session.findUnique({ where: { token } });
    await this.prisma.session.deleteMany({ where: { token } });
    if (session) {
      void this.audit.record({ action: 'LOGOUT', actorId: session.userId });
    }
  }

  // ── Background ───────────────────────────────────────────────────────────

  private async purgeExpiredSessions(): Promise<void> {
    try {
      const { count } = await this.prisma.session.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) console.log(`[auth] purged ${count} expired sessions`);
    } catch (e) {
      console.error('[auth] session purge failed:', e);
    }
  }
}
