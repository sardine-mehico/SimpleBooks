import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import type { AuditAction } from '@prisma/client';
import { AuditService } from './audit.service';
import { AdminOnly } from '../auth/roles.decorator';

const AUDIT_ACTIONS = [
  'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT',
  'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
  'ROLE_CHANGED', 'ROLE_OVERRIDE_CHANGED',
  'API_KEY_CREATED', 'API_KEY_REVOKED',
  'RESOURCE_DELETED', 'DATA_RETENTION_PURGE',
] as const;

class AuditQueryDto {
  @IsOptional() @IsEnum(AUDIT_ACTIONS) action?: AuditAction;
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) take?: number;
}

@ApiTags('audit')
@AdminOnly()
@Controller('audit')
export class AuditController {
  constructor(private service: AuditService) {}

  @Get()
  list(@Query() q: AuditQueryDto) {
    return this.service.list({
      action: q.action,
      actorId: q.actorId,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      take: q.take,
    });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }
}
