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

@Injectable()
export class RetentionService {
  constructor(private prisma: PrismaService) {}

  tables(): readonly RetentionTable[] {
    return TABLES;
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
