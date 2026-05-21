import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, SendInvoiceOverrides } from './mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { INVOICE_MAIL_QUEUE } from './mail.constants';

type SendJob = { invoiceId: string; overrides?: SendInvoiceOverrides };

@Processor(INVOICE_MAIL_QUEUE)
export class InvoiceMailProcessor extends WorkerHost {
  private readonly log = new Logger(InvoiceMailProcessor.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private notifications: NotificationsService,
  ) {
    super();
  }

  // Runs for each scheduled retry. The first synchronous attempt happens in
  // `InvoiceMailService.send`; this processor handles attempts 2-4 only,
  // separated by `INVOICE_MAIL_RETRY_DELAY_MS` (10 min) each.
  async process(job: Job<SendJob>) {
    const { invoiceId, overrides } = job.data;
    try {
      await this.mail.sendInvoice(invoiceId, overrides ?? {});
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'SENT',
          sendAttempts: { increment: 1 },
          sendError: null,
          lastSendAt: new Date(),
        },
      });
      this.log.log(`INV ${invoiceId} sent on retry attempt ${job.attemptsMade + 1}`);
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
      // Re-throw so BullMQ counts the attempt and schedules the next retry
      // (or moves the job to the failed state if attempts is exhausted).
      throw e;
    }
  }

  @OnWorkerEvent('failed')
  async onJobFailed(job: Job<SendJob>) {
    // BullMQ emits `failed` after every individual attempt. We only flip the
    // invoice to FAILED_TO_SEND + dispatch notifications on the FINAL one.
    const total = job.opts?.attempts ?? 1;
    if (job.attemptsMade < total) return;
    try {
      await this.prisma.invoice.update({
        where: { id: job.data.invoiceId },
        data: { status: 'FAILED_TO_SEND' },
      });
      await this.notifications.notifyInvoiceSendFailed(job.data.invoiceId);
    } catch (e) {
      // Never let a notification path crash the worker — log and move on.
      this.log.error(`onJobFailed handler error for ${job.data.invoiceId}: ${(e as Error).message}`);
    }
  }
}
