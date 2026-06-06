import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword, randomToken } from '../auth/password';
import type { AuthUser } from '../auth/auth.service';
import { CreateApiKeyDto } from './dto';

// Secret format: "sb_live_<base64url(32 random bytes)>".
// Stored hashed (argon2id). Prefix + suffix kept in cleartext purely for
// display so an admin can identify a leaked key from the UI list.
const KEY_PREFIX = 'sb_live_';

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.apiKey.findMany({
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
      select: {
        ...this.publicSelect(),
        user: { select: { id: true, username: true, displayName: true, role: true } },
      },
    });
  }

  async create(dto: CreateApiKeyDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.role !== 'API_USER') {
      throw new BadRequestException('API keys can only be issued to API_USER accounts.');
    }
    const secret = `${KEY_PREFIX}${randomToken(32)}`;
    const keyHash = await hashPassword(secret);
    const prefix = secret.slice(0, KEY_PREFIX.length + 8); // "sb_live_xxxxxxxx"
    const suffix = secret.slice(-4);
    const row = await this.prisma.apiKey.create({
      data: {
        userId: user.id,
        label: dto.label,
        keyHash,
        prefix,
        suffix,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      select: this.publicSelect(),
    });
    // The plaintext secret is returned ONLY here — never re-readable.
    return { ...row, secret };
  }

  async revoke(id: string) {
    const row = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('API key not found.');
    if (row.revokedAt) return { id };
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return { id };
  }

  // Called by the API-key auth path. Returns the authenticated user or
  // null. Linear scan over non-revoked keys + argon2 verify — fine for the
  // single-tenant scale.
  async validateBearer(secret: string): Promise<AuthUser | null> {
    if (!secret.startsWith(KEY_PREFIX)) return null;
    const candidates = await this.prisma.apiKey.findMany({
      where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      include: { user: true },
    });
    for (const k of candidates) {
      if (await verifyPassword(k.keyHash, secret)) {
        if (!k.user.isActive) return null;
        await this.prisma.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
        return {
          id: k.user.id,
          username: k.user.username,
          displayName: k.user.displayName,
          role: k.user.role,
        };
      }
    }
    return null;
  }

  private publicSelect() {
    return {
      id: true,
      userId: true,
      label: true,
      prefix: true,
      suffix: true,
      lastUsedAt: true,
      revokedAt: true,
      expiresAt: true,
      createdAt: true,
    } as const;
  }
}
