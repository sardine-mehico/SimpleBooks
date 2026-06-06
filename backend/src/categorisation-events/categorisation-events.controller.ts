import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CategorisationEventsService } from './categorisation-events.service';

@ApiTags('categorisation-events')
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
