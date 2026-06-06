import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsString } from 'class-validator';
import type { UserRole } from '@prisma/client';
import { RolesService } from './roles.service';
import { AdminOnly } from '../auth/roles.decorator';
import { ALL_CAPABILITIES, type Capability } from '../auth/capabilities';

const ROLE_VALUES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'API_USER'] as const;

class UpsertOverrideDto {
  @IsEnum(ROLE_VALUES) role!: UserRole;
  @IsString() capability!: Capability;
  @IsBoolean() allowed!: boolean;
}

@ApiTags('roles')
@AdminOnly()
@Controller('roles')
export class RolesController {
  constructor(private service: RolesService) {}

  @Get('capabilities')
  capabilities() {
    return { capabilities: ALL_CAPABILITIES };
  }

  @Get('matrix')
  async matrix() {
    const all = await this.service.allRolesCapabilities();
    return { matrix: all };
  }

  @Put('override')
  async setOverride(@Body() dto: UpsertOverrideDto) {
    await this.service.setOverride(dto.role, dto.capability, dto.allowed);
    return { ok: true };
  }

  @Delete('override/:role/:capability')
  async clearOverride(@Param('role') role: UserRole, @Param('capability') capability: Capability) {
    await this.service.clearOverride(role, capability);
    return { ok: true };
  }
}
