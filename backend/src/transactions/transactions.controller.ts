import { Controller, Get, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ListTransactionsDto } from './dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get() list(@Query() q: ListTransactionsDto) { return this.service.list(q); }
}
