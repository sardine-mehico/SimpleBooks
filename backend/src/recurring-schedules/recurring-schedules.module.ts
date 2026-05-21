import { Module } from '@nestjs/common';
import { RecurringSchedulesController } from './recurring-schedules.controller';
import { RecurringSchedulesService } from './recurring-schedules.service';

@Module({
  controllers: [RecurringSchedulesController],
  providers: [RecurringSchedulesService],
  exports: [RecurringSchedulesService],
})
export class RecurringSchedulesModule {}
