import { Module } from '@nestjs/common';
import { CategorisationEventsController } from './categorisation-events.controller';
import { CategorisationEventsService } from './categorisation-events.service';

@Module({
  controllers: [CategorisationEventsController],
  providers: [CategorisationEventsService],
  exports: [CategorisationEventsService],
})
export class CategorisationEventsModule {}
