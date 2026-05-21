import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { InvoiceMailService } from './invoice-mail.service';
import { InvoiceMailProcessor } from './invoice-mail.processor';
import { INVOICE_MAIL_QUEUE } from './mail.constants';
import { NotificationsModule } from '../notifications/notifications.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [BullModule.registerQueue({ name: INVOICE_MAIL_QUEUE }), NotificationsModule, PdfModule],
  controllers: [MailController],
  providers: [MailService, InvoiceMailService, InvoiceMailProcessor],
  exports: [MailService, InvoiceMailService],
})
export class MailModule {}
