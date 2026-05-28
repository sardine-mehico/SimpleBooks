import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ApplyPaymentDto } from './payments.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get('queue')
  queue(@Query('showAll') showAll?: string) {
    return this.payments.getQueue({ showAll: showAll === 'true' });
  }

  @Get('queue/count')
  queueCount(@Query('showAll') showAll?: string) {
    return this.payments.getQueueCount({ showAll: showAll === 'true' });
  }

  @Get('candidates/:transactionId')
  candidates(@Param('transactionId', new ParseUUIDPipe()) transactionId: string) {
    return this.payments.getCandidates(transactionId);
  }

  @Post('apply')
  @HttpCode(200)
  apply(@Body() dto: ApplyPaymentDto) {
    return this.payments.applyAllocations(
      dto.transactionId,
      dto.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
    );
  }

  @Delete('allocations/:id')
  @HttpCode(204)
  async deleteAllocation(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.payments.deleteAllocation(id);
  }

  @Post('dismiss/:transactionId')
  @HttpCode(204)
  async dismiss(@Param('transactionId', new ParseUUIDPipe()) transactionId: string): Promise<void> {
    await this.payments.dismiss(transactionId);
  }

  @Post('undismiss/:transactionId')
  @HttpCode(204)
  async undismiss(@Param('transactionId', new ParseUUIDPipe()) transactionId: string): Promise<void> {
    await this.payments.undismiss(transactionId);
  }
}
