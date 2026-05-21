import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, SendInvoiceOverrides } from './mail.service';
import {
  INVOICE_MAIL_QUEUE,
  INVOICE_MAIL_RETRY_ATTEMPTS,
  INVOICE_MAIL_RETRY_DELAY_MS,
} from './mail.constants';

export type SendResult =
  | { status: 'SENT'; messageId?: string }
  | { status: 'QUEUED_FOR_RETRY'; error: string; triesRemaining: number }
  | { status: 'NOT_FOUND' };

@Injectable()
export class InvoiceMailService {
  private readonly log = new Logger(InvoiceMailService.name);

  constructor(
    @InjectQueue(INVOICE_MAIL_QUEUE) private queue: Queue,
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // Manual-send entry point used by `POST /invoices/:id/send` and the
  // recurring processor's SEND_DIRECTLY path. The first attempt fires
  // synchronously so the UI gets immediate success/failure feedback. If it
  // fails we enqueue 3 more retries spaced 10 minutes apart (4 total
  // attempts). After all 4 fail the queue's worker `onJobFailed` hook flips
  // the status to FAILED_TO_SEND and notifies via NotificationsService.
  // `overrides` lets the Send Invoice dialog supply user-edited
  // From/To/CC/BCC/Subject/HTML/text; missing fields fall back to the
  // assigned EmailTemplate + BillingCompany routing.
  async send(invoiceId: string, overrides: SendInvoiceOverrides = {}): Promise<SendResult> {
    const exists = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!exists) throw new NotFoundException();

    try {
      const result = await this.mail.sendInvoice(invoiceId, overrides);
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'SENT',
          sendAttempts: { increment: 1 },
          sendError: null,
          lastSendAt: new Date(),
        },
      });
      this.log.log(`INV ${invoiceId} sent synchronously`);
      return { status: 'SENT', messageId: result.messageId };
    } catch (e) {
      const msg = (e as Error).message;
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          sendAttempts: { increment: 1 },
          sendError: msg,
          lastSendAt: new Date(),
        },
      });
      await this.queue.add(
        'send',
        // Retries replay the same overrides so the customer gets the email
        // the user composed, not a fresh template render.
        { invoiceId, overrides },
        {
          attempts: INVOICE_MAIL_RETRY_ATTEMPTS,
          backoff: { type: 'fixed', delay: INVOICE_MAIL_RETRY_DELAY_MS },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
      this.log.warn(
        `INV ${invoiceId} sync send failed (${msg}). Queued ${INVOICE_MAIL_RETRY_ATTEMPTS} retries every ${INVOICE_MAIL_RETRY_DELAY_MS / 60_000} min.`,
      );
      return {
        status: 'QUEUED_FOR_RETRY',
        error: msg,
        triesRemaining: INVOICE_MAIL_RETRY_ATTEMPTS,
      };
    }
  }
}
