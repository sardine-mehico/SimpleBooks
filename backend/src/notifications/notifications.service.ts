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

    // Email recipients:
    //   1. Billing company's accountsEmail (per-invoice tenant address).
    //   2. Every address in NOTIFICATION_EMAILS env (comma-separated, trimmed,
    //      lowercased, deduped). Used by ops to "always copy me" regardless
    //      of which billing company owns the failing invoice.
    // The two sources are merged into a single Resend call so multiple
    // recipients cost one HTTPS quota slot.
    const recipients = mergeRecipients(
      inv.billingCompany?.accountsEmail,
      process.env.NOTIFICATION_EMAILS,
    );
    if (recipients.length === 0) {
      this.log.warn(`Skipped failure email for invoice ${inv.invoiceNumber}: no billing-company accountsEmail and NOTIFICATION_EMAILS unset.`);
      return;
    }
    try {
      await this.resend.sendPlain(recipients, summary, body);
      this.log.log(`Send-failure email queued via Resend to ${recipients.join(', ')}`);
    } catch (e) {
      this.log.warn(`Resend send-failure email to ${recipients.join(', ')} failed: ${(e as Error).message}`);
    }
  }
}

// Build a deduped lowercased recipient list from the billing-co address +
// the comma-separated NOTIFICATION_EMAILS env. Exported test target.
export function mergeRecipients(
  billingCoEmail: string | null | undefined,
  envCsv: string | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    const v = raw.trim().toLowerCase();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  push(billingCoEmail);
  if (envCsv) {
    for (const part of envCsv.split(',')) push(part);
  }
  return out;
}
