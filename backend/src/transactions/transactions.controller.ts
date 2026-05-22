import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ListTransactionsDto, SetCategoryDto, SetSplitsDto } from './dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get() list(@Query() q: ListTransactionsDto) { return this.service.list(q); }

  @Post(':id/splits') setSplits(@Param('id') id: string, @Body() dto: SetSplitsDto) {
    return this.service.setSplits(id, dto.splits);
  }

  @Delete(':id/splits') clearSplits(@Param('id') id: string) {
    return this.service.clearSplits(id);
  }

  @Patch(':id/category') setCategory(@Param('id') id: string, @Body() dto: SetCategoryDto) {
    return this.service.setCategory(id, dto);
  }
}
