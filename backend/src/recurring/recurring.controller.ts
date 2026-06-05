import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { CreateRecurringRuleDto, UpdateRecurringRuleDto } from './dto';

@Controller('recurring')
export class RecurringController {
  constructor(private recurring: RecurringService) {}

  @Get() list() { return this.recurring.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.recurring.get(id); }
  @Post() create(@Body() dto: CreateRecurringRuleDto) { return this.recurring.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateRecurringRuleDto, @Headers('if-match') ifMatch?: string) { return this.recurring.update(id, dto, ifMatch); }
  @Delete(':id') remove(@Param('id') id: string) { return this.recurring.remove(id); }
}
