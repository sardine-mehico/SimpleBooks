import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RecurringController } from './recurring.controller';
import { RecurringService } from './recurring.service';
import { RecurringProcessor } from './recurring.processor';
import { RECURRING_QUEUE } from './recurring.constants';
import { InvoicesModule } from '../invoices/invoices.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [BullModule.registerQueue({ name: RECURRING_QUEUE }), InvoicesModule, MailModule],
  controllers: [RecurringController],
  providers: [RecurringService, RecurringProcessor],
})
export class RecurringModule {}
