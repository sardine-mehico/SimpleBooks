import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';
import { EmailEncryption } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { applyDynamicFields } from '../common/dynamic-fields';

export type SmtpConfig = {
  smtpServer: string;
  port: number;
  encryption: EmailEncryption;
  user: string;
  password: string;
};

// User-editable overrides from the Send Invoice dialog. Every field is
// optional: missing fields fall back to the assigned EmailTemplate (after
// token substitution) and the routing defaults from BillingCompany. The
// dialog itself only lets the user edit From / To / CC / BCC / Subject /
// attachPdf — `html` is included here so the body that the dialog displayed
// to the user (already token-substituted) is what actually goes out, even if
// the template changes between dialog open and send. `attachPdf` is the
// "Attach PDF invoice" checkbox on the dialog — off by default (the
// customer-facing public link replaces the attachment in the standard flow).
export type SendInvoiceOverrides = {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  html?: string;
  attachPdf?: boolean;
};

// Mint a 32-byte URL-safe random token (~43 chars, 256 bits of entropy).
// Stored on `Invoice.publicToken` with @unique — the customer-facing
// /i/:token route looks it up directly, no HMAC needed.
function mintPublicToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);

  constructor(
    private prisma: PrismaService,
    private pdf: PdfService,
  ) {}

  // Build a nodemailer transport from our DB-stored config. `encryption`
  // values:
  //   NONE     → no TLS at all (plain SMTP)
  //   SSL      → implicit TLS on connect (typically port 465)
  //   STARTTLS → opportunistic STARTTLS (typically port 587)
  //   TLS      → require STARTTLS (same wire shape as STARTTLS for nodemailer)
  private buildTransport(cfg: SmtpConfig): nodemailer.Transporter {
    const secure = cfg.encryption === 'SSL';
    const requireTLS = cfg.encryption === 'TLS';
    return nodemailer.createTransport({
      host: cfg.smtpServer,
      port: cfg.port,
      secure,
      requireTLS,
      auth: cfg.user || cfg.password ? { user: cfg.user, pass: cfg.password } : undefined,
      // Fail fast — the test button must not hang on dead hosts.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  // Send a test email using the supplied SMTP config and recipient. Throws on
  // any underlying nodemailer / SMTP error so callers can surface the message.
  async sendTest(cfg: SmtpConfig, to: string) {
    const transport = this.buildTransport(cfg);
    const from = cfg.user || 'noreply@simplebooks.dev';
    const info = await transport.sendMail({
      from,
      to,
      subject: 'SimpleBooks SMTP test',
      text:
        'This is a test message from SimpleBooks confirming that your SMTP credentials work.\n\n' +
        'If you received this email, the SMTP configuration is functioning correctly.',
    });
    this.log.log(`Test mail accepted by server: messageId=${info.messageId}`);
    return { messageId: info.messageId };
  }

  // Resolve the outbound SMTP config for an invoice:
  //   CUSTOM_SMTP on the billing company → that company's own credentials
  //   GENERAL_SMTP (default)             → the singleton MailConfiguration row
  // Returns null when nothing is configured (e.g. brand-new install where
  // MailConfiguration.smtpServer is still empty). The caller treats that as a
  // fast-fail rather than connecting to an empty host.
  private async resolveConfigForInvoice(invoiceId: string): Promise<SmtpConfig | null> {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { billingCompany: true },
    });
    if (!inv) return null;
    const co = inv.billingCompany;
    if (
      co?.sendVia === 'CUSTOM_SMTP' &&
      co.customSmtpServer &&
      co.customSmtpPort &&
      co.customSmtpEncryption
    ) {
      return {
        smtpServer: co.customSmtpServer,
        port: co.customSmtpPort,
        encryption: co.customSmtpEncryption,
        user: co.customSmtpUser ?? '',
        password: co.customSmtpPassword ?? '',
      };
    }
    const sys = await this.prisma.mailConfiguration.findFirst();
    if (!sys || !sys.smtpServer) return null;
    return {
      smtpServer: sys.smtpServer,
      port: sys.port,
      encryption: sys.encryption,
      user: sys.user,
      password: sys.password,
    };
  }

  // Render the email template + PDF and dispatch the invoice email. Throws on
  // any SMTP error so the caller (`/invoices/:id/send` controller and the
  // BullMQ retry worker) can branch on failure to schedule retries /
  // notifications. `overrides` is populated when the user has edited the
  // Send Invoice dialog; missing fields fall back to the assigned template
  // and billing-company routing.
  async sendInvoice(
    invoiceId: string,
    overrides: SendInvoiceOverrides = {},
  ): Promise<{ messageId: string }> {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        billingCompany: true,
        emailTemplate: true,
        lineItems: true,
      },
    });
    if (!inv) throw new Error('Invoice not found');

    // Resolve recipient. The override wins (dialog has already validated it),
    // then the customer's primary billing email.
    const to = overrides.to?.trim() || inv.customer?.billingEmail1;
    if (!to) {
      throw new Error('Customer has no primary billing email');
    }

    const cfg = await this.resolveConfigForInvoice(invoiceId);
    if (!cfg) {
      throw new Error(
        'No SMTP configured for this invoice (Billing Company is set to General SMTP but Settings / Mail Configuration is empty).',
      );
    }
    const transport = this.buildTransport(cfg);

    // Ensure this invoice has a public token before we render the body. If
    // missing, mint now and persist immediately so any BullMQ retry replays
    // against the same token (the email the customer receives must contain a
    // stable URL across attempts).
    let publicToken = inv.publicToken;
    if (!publicToken) {
      publicToken = mintPublicToken();
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: { publicToken, publicTokenIssuedAt: new Date() },
      });
    }
    const appUrl = process.env.PUBLIC_APP_URL?.trim();
    if (!appUrl) {
      throw new Error(
        'PUBLIC_APP_URL is not set — refusing to send an invoice email without a customer-facing link.',
      );
    }
    const invoiceLink = `${appUrl.replace(/\/+$/, '')}/i/${publicToken}`;

    // Subject + body: substitute tokens from the assigned EmailTemplate
    // unless the dialog provided final strings. The dialog calls
    // `/invoices/:id/send-context` which returns already-substituted
    // strings, so anything in `overrides` is treated as final.
    const tokenCtx = {
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      invoiceNumber: `INV-${inv.invoiceNumber}`,
      customerName: inv.customer?.name ?? null,
      billingCompany: inv.billingCompany?.name ?? null,
      accountsEmail: inv.billingCompany?.accountsEmail ?? null,
      invoiceLink,
    };
    const subject =
      overrides.subject ??
      applyDynamicFields(
        inv.emailTemplate?.subject ?? `Invoice INV-${inv.invoiceNumber}`,
        tokenCtx,
      );
    const html =
      overrides.html ??
      applyDynamicFields(inv.emailTemplate?.body ?? '', tokenCtx);

    const from = overrides.from?.trim() || inv.billingCompany?.accountsEmail || cfg.user || 'noreply@simplebooks.dev';
    const cc = overrides.cc?.trim() || undefined;
    const bcc = overrides.bcc?.trim() || inv.billingCompany?.invoiceBcc || undefined;

    // PDF attachment is opt-in via the "Attach PDF invoice" checkbox on the
    // Send Invoice dialog. The public link in the body is the default delivery
    // mechanism; the attachment is for customers who want a local copy
    // straight from the email.
    const attachments = overrides.attachPdf
      ? await (async () => {
          const pdf = await this.pdf.renderInvoice(invoiceId);
          return [{ filename: pdf.filename, content: pdf.buffer }];
        })()
      : undefined;

    const info = await transport.sendMail({
      from,
      to,
      cc,
      bcc,
      subject,
      html: html || undefined,
      attachments,
    });
    this.log.log(
      `INV-${inv.invoiceNumber} sent to ${to}: messageId=${info.messageId}` +
        (overrides.attachPdf ? ' (+PDF attachment)' : ''),
    );
    return { messageId: info.messageId };
  }
}
