import { Controller, Get, Query } from '@nestjs/common';
import { CategorisationEventsService } from './categorisation-events.service';

@Controller('categorisation-events')
export class CategorisationEventsController {
  constructor(private service: CategorisationEventsService) {}

  @Get() list(
    @Query('transactionId') transactionId?: string,
    @Query('source') source?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      transactionId,
      source,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
