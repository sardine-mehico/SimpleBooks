import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Tables exposed in the Data Retention UI. Keep this list aligned with what
// admins want to manage; the frontend renders one row per entry.
const TABLES = [
  'AuditLog',
  'TransactionImport',
  'AllocationEvent',
  'CategorisationEvent',
  'AiCall',
  'Session',
] as const;
export type RetentionTable = (typeof TABLES)[number];

export type RetentionAge = '7d' | '30d' | '90d' | '1y';

@Injectable()
export class RetentionService {
  constructor(private prisma: PrismaService) {}

  tables(): readonly RetentionTable[] {
    return TABLES;
  }

  async listPolicies() {
    const rows = await this.prisma.retentionPolicy.findMany();
    const byTable = new Map(rows.map((r) => [r.table, r] as const));
    // Always return a row per known table (defaults: 1y, disabled).
    return TABLES.map((t) => {
      const row = byTable.get(t);
      return {
        table: t,
        cutoffAge: (row?.cutoffAge as RetentionAge) ?? '1y',
        enabled: row?.enabled ?? false,
        lastRunAt: row?.lastRunAt ? row.lastRunAt.toISOString() : null,
      };
    });
  }

  async upsertPolicy(table: RetentionTable, cutoffAge: RetentionAge, enabled: boolean) {
    return this.prisma.retentionPolicy.upsert({
      where: { table },
      create: { table, cutoffAge, enabled },
      update: { cutoffAge, enabled },
    });
  }

  async stats() {
    const out: Record<string, { count: number; oldestAt: string | null }> = {};
    for (const t of TABLES) {
      const [count, oldest] = await this.statsFor(t);
      out[t] = { count, oldestAt: oldest ? oldest.toISOString() : null };
    }
    return out;
  }

  async purge(table: RetentionTable, before: Date): Promise<number> {
    switch (table) {
      case 'AuditLog':            return (await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: before } } })).count;
      case 'TransactionImport':   return (await this.prisma.transactionImport.deleteMany({ where: { importedAt: { lt: before } } })).count;
      case 'AllocationEvent':     return (await this.prisma.allocationEvent.deleteMany({ where: { createdAt: { lt: before } } })).count;
      case 'CategorisationEvent': return (await this.prisma.categorisationEvent.deleteMany({ where: { createdAt: { lt: before } } })).count;
      case 'AiCall':              return (await this.prisma.aiCall.deleteMany({ where: { createdAt: { lt: before } } })).count;
      case 'Session':             return (await this.prisma.session.deleteMany({ where: { createdAt: { lt: before } } })).count;
      default: throw new BadRequestException('Unknown table');
    }
  }

  private async statsFor(table: RetentionTable): Promise<[number, Date | null]> {
    switch (table) {
      case 'AuditLog': {
        const [count, oldest] = await Promise.all([
          this.prisma.auditLog.count(),
          this.prisma.auditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        ]);
        return [count, oldest?.createdAt ?? null];
      }
      case 'TransactionImport': {
        const [count, oldest] = await Promise.all([
          this.prisma.transactionImport.count(),
          this.prisma.transactionImport.findFirst({ orderBy: { importedAt: 'asc' }, select: { importedAt: true } }),
        ]);
        return [count, oldest?.importedAt ?? null];
      }
      case 'AllocationEvent': {
        const [count, oldest] = await Promise.all([
          this.prisma.allocationEvent.count(),
          this.prisma.allocationEvent.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        ]);
        return [count, oldest?.createdAt ?? null];
      }
      case 'CategorisationEvent': {
        const [count, oldest] = await Promise.all([
          this.prisma.categorisationEvent.count(),
          this.prisma.categorisationEvent.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        ]);
        return [count, oldest?.createdAt ?? null];
      }
      case 'AiCall': {
        const [count, oldest] = await Promise.all([
          this.prisma.aiCall.count(),
          this.prisma.aiCall.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        ]);
        return [count, oldest?.createdAt ?? null];
      }
      case 'Session': {
        const [count, oldest] = await Promise.all([
          this.prisma.session.count(),
          this.prisma.session.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        ]);
        return [count, oldest?.createdAt ?? null];
      }
    }
  }
}
