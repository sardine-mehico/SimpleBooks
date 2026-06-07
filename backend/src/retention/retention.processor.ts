import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RetentionService, type RetentionTable } from './retention.service';
import { RETENTION_QUEUE } from './retention.constants';

type Age = '7d' | '30d' | '90d' | '1y';

function computeCutoff(age: Age): Date {
  const now = Date.now();
  switch (age) {
    case '7d':  return new Date(now - 7   * 86_400_000);
    case '30d': return new Date(now - 30  * 86_400_000);
    case '90d': return new Date(now - 90  * 86_400_000);
    case '1y':  return new Date(now - 365 * 86_400_000);
  }
}

@Processor(RETENTION_QUEUE)
export class RetentionProcessor extends WorkerHost {
  private readonly log = new Logger(RetentionProcessor.name);

  constructor(
    private prisma: PrismaService,
    private retention: RetentionService,
    private audit: AuditService,
  ) {
    super();
  }

  async process(_job: Job) {
    const policies = await this.prisma.retentionPolicy.findMany({ where: { enabled: true } });
    if (policies.length === 0) return;

    for (const p of policies) {
      const age = p.cutoffAge as Age;
      if (!['7d', '30d', '90d', '1y'].includes(age)) {
        this.log.warn(`Skipping policy ${p.table}: invalid cutoffAge "${p.cutoffAge}"`);
        continue;
      }
      const cutoff = computeCutoff(age);
      try {
        const deleted = await this.retention.purge(p.table as RetentionTable, cutoff);
        await this.prisma.retentionPolicy.update({
          where: { table: p.table },
          data: { lastRunAt: new Date() },
        });
        await this.audit.record({
          action: 'DATA_RETENTION_PURGE',
          actorId: null,
          targetType: p.table,
          metadata: { auto: true, age, before: cutoff.toISOString(), deleted },
        });
        this.log.log(`Auto-purge ${p.table} older than ${age}: ${deleted} row(s)`);
      } catch (e) {
        this.log.error(`Auto-purge ${p.table} failed: ${(e as Error).message}`);
      }
    }
  }
}
