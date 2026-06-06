import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordParams {
  action: AuditAction;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // Fire-and-forget recording. We catch internal failures so an audit-write
  // error never breaks the user's primary request — the audit channel is a
  // supplement, not a critical path.
  async record(p: RecordParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: p.action,
          actorId: p.actorId ?? null,
          targetType: p.targetType,
          targetId: p.targetId,
          ipAddress: p.ipAddress,
          userAgent: p.userAgent,
          metadata: p.metadata as any,
        },
      });
    } catch (e) {
      console.error('[audit] write failed:', e);
    }
  }

  async list(params: {
    action?: AuditAction;
    actorId?: string;
    from?: Date;
    to?: Date;
    take?: number;
  } = {}) {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.action) where.action = params.action;
    if (params.actorId) where.actorId = params.actorId;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) (where.createdAt as any).gte = params.from;
      if (params.to) (where.createdAt as any).lte = params.to;
    }
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.take ?? 500,
      include: { actor: { select: { id: true, username: true, displayName: true, role: true } } },
    });
  }

  async stats() {
    const [count, oldest] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    return { count, oldestAt: oldest?.createdAt ?? null };
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    await this.record({
      action: 'DATA_RETENTION_PURGE',
      targetType: 'AuditLog',
      metadata: { deleted: count, before: cutoff.toISOString() },
    });
    return count;
  }
}
