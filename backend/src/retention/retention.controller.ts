import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString } from 'class-validator';
import { RetentionService, type RetentionAge, type RetentionTable } from './retention.service';
import { AuditService } from '../audit/audit.service';
import { AdminOnly } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';

const TABLE_VALUES: RetentionTable[] = [
  'AuditLog', 'TransactionImport', 'AllocationEvent',
  'CategorisationEvent', 'AiCall', 'Session',
];

class PurgeDto {
  @IsString() @IsIn(TABLE_VALUES) table!: RetentionTable;
  // Predefined buckets keep the surface small and prevent fat-finger purges.
  @IsString() @IsIn(['7d', '30d', '90d', '1y', 'all']) age!: '7d' | '30d' | '90d' | '1y' | 'all';
}

class PolicyDto {
  @IsString() @IsIn(['7d', '30d', '90d', '1y']) cutoffAge!: RetentionAge;
  @IsBoolean() enabled!: boolean;
}

@ApiTags('data-retention')
@AdminOnly()
@Controller('data-retention')
export class RetentionController {
  constructor(private service: RetentionService, private audit: AuditService) {}

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('policies')
  policies() {
    return this.service.listPolicies();
  }

  @Put('policies/:table')
  async upsertPolicy(
    @CurrentUser() actor: AuthUser,
    @Param('table') table: string,
    @Body() dto: PolicyDto,
  ) {
    if (!TABLE_VALUES.includes(table as RetentionTable)) {
      throw new BadRequestException('Unknown table');
    }
    const row = await this.service.upsertPolicy(table as RetentionTable, dto.cutoffAge, dto.enabled);
    await this.audit.record({
      action: 'DATA_RETENTION_PURGE',
      actorId: actor.id,
      targetType: table,
      metadata: { policyChange: true, cutoffAge: dto.cutoffAge, enabled: dto.enabled },
    });
    return row;
  }

  @Post('purge')
  async purge(@CurrentUser() actor: AuthUser, @Body() dto: PurgeDto) {
    const cutoff = computeCutoff(dto.age);
    const deleted = await this.service.purge(dto.table, cutoff);
    await this.audit.record({
      action: 'DATA_RETENTION_PURGE',
      actorId: actor.id,
      targetType: dto.table,
      metadata: { age: dto.age, before: cutoff.toISOString(), deleted },
    });
    return { deleted };
  }
}

function computeCutoff(age: PurgeDto['age']): Date {
  const now = Date.now();
  switch (age) {
    case '7d':  return new Date(now - 7  * 86_400_000);
    case '30d': return new Date(now - 30 * 86_400_000);
    case '90d': return new Date(now - 90 * 86_400_000);
    case '1y':  return new Date(now - 365 * 86_400_000);
    case 'all': return new Date(now + 86_400_000); // anything before tomorrow = everything
  }
}
