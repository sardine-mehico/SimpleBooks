import { Controller, Get, Query } from '@nestjs/common';
import { StatementsService } from './statements.service';
import { StatementQueryDto } from './dto';

@Controller('statements')
export class StatementsController {
  constructor(private statements: StatementsService) {}

  @Get()
  get(@Query() q: StatementQueryDto) {
    return this.statements.getStatement({
      customerId: q.customerId,
      billingCompanyId: q.billingCompanyId,
      dateFrom: q.dateFrom ?? null,
      dateTo: q.dateTo ?? null,
    });
  }
}
