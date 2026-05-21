import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { ResendService } from './resend.service';

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    private resend: ResendService,
  ) {}

  // Called by the invoice-mail retry worker once all retry attempts have been
  // exhausted. Fires both channels in parallel:
  //   - Telegram: broadcast to every connected chat (best effort per chat).
  //   - Email:    direct via Resend (HTTPS, not SMTP) to the billing company's
  //               accountsEmail — so a broken outbound SMTP can't suppress its
  //               own failure alert.
  // Each channel's failure is logged but never thrown — a notification path
  // collapsing must not turn into an unhandled rejection inside a BullMQ
  // worker and crash the queue.
  async notifyInvoiceSendFailed(invoiceId: string): Promise<void> {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: true, billingCompany: true },
    });
    if (!inv) return;

    const summary = `INV-${inv.invoiceNumber} (${inv.customer?.name ?? 'no customer'}) failed to send after ${inv.sendAttempts} attempts.`;
    const reason = inv.sendError ? `\n\nLast error:\n${inv.sendError}` : '';
    const body = `${summary}${reason}\n\nOpen the invoice in SimpleBooks to retry once the SMTP issue is resolved.`;

    // Telegram — broadcast.
    try {
      const count = await this.telegram.notify(body);
      this.log.log(`Send-failure broadcast: Telegram chats notified=${count}`);
    } catch (e) {
      this.log.warn(`Telegram broadcast failed: ${(e as Error).message}`);
    }

    // Email — only when the billing company has an accountsEmail.
    const to = inv.billingCompany?.accountsEmail;
    if (!to) {
      this.log.warn(`Skipped failure email for invoice ${inv.invoiceNumber}: billing company has no accountsEmail.`);
      return;
    }
    try {
      await this.resend.sendPlain(to, summary, body);
      this.log.log(`Send-failure email queued via Resend to ${to}`);
    } catch (e) {
      this.log.warn(`Resend send-failure email to ${to} failed: ${(e as Error).message}`);
    }
  }
}
