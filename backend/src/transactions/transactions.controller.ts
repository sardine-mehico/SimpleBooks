import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { BulkDeleteDto, CreateTransactionDto, ListTransactionsDto, SetCategoryDto, SetSplitsDto, UpdateTransactionDto } from './dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private service: TransactionsService, private prisma: PrismaService) {}

  @Get() list(@Query() q: ListTransactionsDto) { return this.service.list(q); }

  @Get('stats')
  stats(@Query('accountIds') accountIds?: string) {
    const ids = accountIds ? accountIds.split(',').filter(Boolean) : undefined;
    return this.service.stats(ids);
  }

  @Get('by-event/:eventId')
  async byEvent(@Param('eventId') eventId: string) {
    const event = await this.prisma.categorisationEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    return this.service.get(event.transactionId);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteOne(@Param('id') id: string): Promise<void> {
    await this.service.deleteTransaction(id);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  bulkDelete(@Body() dto: BulkDeleteDto) {
    return this.service.bulkDelete(dto.ids ?? []);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateTransactionDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.service.updateFields(id, dto);
  }

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
