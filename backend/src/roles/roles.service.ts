import { Injectable } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_CAPABILITIES, DEFAULT_CAPABILITIES_BY_ROLE, type Capability } from '../auth/capabilities';

const CACHE_TTL_MS = 60_000;

@Injectable()
export class RolesService {
  private cache: Record<UserRole, Record<Capability, boolean>> | null = null;
  private cachedAt = 0;

  constructor(private prisma: PrismaService) {}

  async capabilitiesForRole(role: UserRole): Promise<Record<Capability, boolean>> {
    await this.ensureCache();
    return this.cache![role];
  }

  async allRolesCapabilities(): Promise<Record<UserRole, Record<Capability, boolean>>> {
    await this.ensureCache();
    return this.cache!;
  }

  async hasCapability(role: UserRole, capability: Capability): Promise<boolean> {
    const caps = await this.capabilitiesForRole(role);
    return caps[capability] === true;
  }

  async setOverride(role: UserRole, capability: Capability, allowed: boolean) {
    if (!ALL_CAPABILITIES.includes(capability)) {
      throw new Error(`Unknown capability: ${capability}`);
    }
    // ADMIN is always granted everything — refuse to weaken it via overrides
    // to prevent self-lockout scenarios.
    if (role === 'ADMIN' && allowed === false) {
      throw new Error('ADMIN role cannot be denied any capability.');
    }
    await this.prisma.roleOverride.upsert({
      where: { role_capability: { role, capability } },
      update: { allowed },
      create: { role, capability, allowed },
    });
    this.invalidate();
  }

  async clearOverride(role: UserRole, capability: Capability) {
    await this.prisma.roleOverride.deleteMany({ where: { role, capability } });
    this.invalidate();
  }

  // Force the cache to be rebuilt on next access — called after the
  // override matrix UI saves.
  invalidate() {
    this.cache = null;
    this.cachedAt = 0;
  }

  private async ensureCache() {
    const now = Date.now();
    if (this.cache && now - this.cachedAt < CACHE_TTL_MS) return;
    const merged: Record<UserRole, Record<Capability, boolean>> = {
      ADMIN: { ...DEFAULT_CAPABILITIES_BY_ROLE.ADMIN },
      ACCOUNTANT: { ...DEFAULT_CAPABILITIES_BY_ROLE.ACCOUNTANT },
      BOOKKEEPER: { ...DEFAULT_CAPABILITIES_BY_ROLE.BOOKKEEPER },
      API_USER: { ...DEFAULT_CAPABILITIES_BY_ROLE.API_USER },
    };
    const overrides = await this.prisma.roleOverride.findMany();
    for (const o of overrides) {
      if (ALL_CAPABILITIES.includes(o.capability as Capability)) {
        merged[o.role][o.capability as Capability] = o.allowed;
      }
    }
    // ADMIN can never be weakened.
    for (const c of ALL_CAPABILITIES) merged.ADMIN[c] = true;
    this.cache = merged;
    this.cachedAt = now;
  }
}
