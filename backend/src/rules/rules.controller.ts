import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RulesService } from './rules.service';
import { CreateRuleDto, MoveRuleDto, RuleStateDto, SetRuleStateDto, ToggleRuleActiveDto, UpdateRuleDto } from './dto';

@ApiTags('rules')
@Controller('rules')
export class RulesController {
  constructor(private service: RulesService) {}

  @Get() list(
    @Query('state') state?: string | string[],
    @Query('isActive') isActive?: string,
  ) {
    const stateArr = state ? (Array.isArray(state) ? state : [state]) as RuleStateDto[] : undefined;
    const active = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.list({ state: stateArr, isActive: active });
  }

  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateRuleDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateRuleDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
  @Patch(':id/move') move(@Param('id') id: string, @Body() dto: MoveRuleDto) { return this.service.move(id, dto.direction); }
  @Patch(':id/state') setState(@Param('id') id: string, @Body() dto: SetRuleStateDto) { return this.service.setState(id, dto.state); }
  @Patch(':id/toggle-active') toggleActive(@Param('id') id: string, @Body() dto: ToggleRuleActiveDto) { return this.service.toggleActive(id, dto.isActive); }
}
