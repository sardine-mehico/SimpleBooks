import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { CreateRecurringScheduleDto, UpdateRecurringScheduleDto } from './dto';

@Controller('recurring-schedules')
export class RecurringSchedulesController {
  constructor(private svc: RecurringSchedulesService) {}

  @Get() list() { return this.svc.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }
  @Post() create(@Body() dto: CreateRecurringScheduleDto) { return this.svc.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateRecurringScheduleDto) { return this.svc.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
