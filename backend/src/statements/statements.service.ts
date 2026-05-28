import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { localStartOfDay, localEndOfDay } from '../util/dates';
import type { StatementResponse, StatementRow, StatementSendContext } from './types';
import { PdfService } from '../pdf/pdf.service';
import { MailService, SendStatementOverrides } from '../mail/mail.service';

type GetParams = {
  customerId: string;
  billingCompanyId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
};

function fmtDateLocal(d: Date): string {
  // YYYY-MM-DD using local calendar parts (timezone of the running process).
  // Sufficient here because the spec column shows the row's "calendar date"
  // independent of the user's tz — and DB Date columns carry no time-of-day
  // info beyond what was inserted.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDdMmYyyy(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}

function formatRangeForSubject(dateFrom: string | null, dateTo: string | null): string {
  if (!dateFrom && !dateTo) return 'All transactions';
  if (dateFrom && dateTo) return `${dateFrom} – ${dateTo}`;
  if (dateFrom) return `from ${dateFrom}`;
  return `to ${dateTo}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

@Injectable()
export class StatementsService {
  constructor(
    private prisma: PrismaService,
    private pdf: PdfService,
    private mail: MailService,
  ) {}

  async getStatement(params: GetParams): Promise<StatementResponse> {
    const { customerId, billingCompanyId } = params;
    const dateFrom = params.dateFrom ?? null;
    const dateTo = params.dateTo ?? null;

    const [customer, billingCompany, prefs] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.billingCompany.findUnique({ where: { id: billingCompanyId } }),
      this.prisma.preferences.findFirst(),
    ]);
    if (!customer) throw new NotFoundException('Customer not found');
    if (!billingCompany) throw new NotFoundException('Billing company not found');
    const tz = prefs?.timezone ?? 'Australia/Perth';

    const fromInstant = dateFrom ? localStartOfDay(dateFrom, tz) : null;
    const toInstant = dateTo ? localEndOfDay(dateTo, tz) : null;

    const openingBalance = await this.computeOpeningBalance({
      customerId, billingCompanyId, fromInstant,
    });

    // --- Body invoice rows ---
    const bodyInvoiceWhere: any = {
      customerId,
      billingCompanyId,
      status: { not: 'VOID' },
    };
    if (fromInstant || toInstant) {
      bodyInvoiceWhere.invoiceDate = {};
      if (fromInstant) bodyInvoiceWhere.invoiceDate.gte = fromInstant;
      if (toInstant) bodyInvoiceWhere.invoiceDate.lte = toInstant;
    }
    const bodyInvoices = await this.prisma.invoice.findMany({ where: bodyInvoiceWhere });

    // --- Body payment rows ---
    // Fetch every allocation that links a (this scope, non-VOID) invoice to a
    // transaction whose date sits in [from, to]. Group by transactionId in TS.
    const bodyAllocWhere: any = {
      invoice: {
        customerId,
        billingCompanyId,
        status: { not: 'VOID' },
      },
    };
    if (fromInstant || toInstant) {
      bodyAllocWhere.transaction = { date: {} };
      if (fromInstant) bodyAllocWhere.transaction.date.gte = fromInstant;
      if (toInstant) bodyAllocWhere.transaction.date.lte = toInstant;
    }
    const bodyAllocs = await this.prisma.allocation.findMany({
      where: bodyAllocWhere,
      include: { transaction: true },
    });

    type TxBucket = { transactionId: string; date: Date; payment: Decimal };
    const txBuckets = new Map<string, TxBucket>();
    for (const a of bodyAllocs as any[]) {
      const tx = a.transaction;
      if (!tx) continue;
      const bucket = txBuckets.get(a.transactionId) ?? {
        transactionId: a.transactionId,
        date: tx.date,
        payment: new Decimal('0'),
      };
      bucket.payment = bucket.payment.add(new Decimal(a.amount.toString()));
      txBuckets.set(a.transactionId, bucket);
    }

    // --- Merge + sort ---
    type Sortable =
      | { kind: 'INVOICE'; date: Date; tieKey: number; invoiceNumber: number; total: Decimal }
      | { kind: 'PAYMENT'; date: Date; tieKey: number; transactionId: string; payment: Decimal };

    const merged: Sortable[] = [
      ...bodyInvoices.map((inv: any): Sortable => ({
        kind: 'INVOICE',
        date: inv.invoiceDate,
        tieKey: 0,
        invoiceNumber: inv.invoiceNumber,
        total: new Decimal(inv.totalAmount.toString()),
      })),
      ...Array.from(txBuckets.values()).map((b): Sortable => ({
        kind: 'PAYMENT',
        date: b.date,
        tieKey: 1,
        transactionId: b.transactionId,
        payment: b.payment,
      })),
    ];
    merged.sort((a, b) => {
      const dt = a.date.getTime() - b.date.getTime();
      if (dt !== 0) return dt;
      if (a.tieKey !== b.tieKey) return a.tieKey - b.tieKey;
      if (a.kind === 'INVOICE' && b.kind === 'INVOICE') {
        return a.invoiceNumber - b.invoiceNumber;
      }
      if (a.kind === 'PAYMENT' && b.kind === 'PAYMENT') {
        return a.transactionId.localeCompare(b.transactionId);
      }
      return 0;
    });

    // --- Walk rows, compute running balance + summary ---
    let running = openingBalance;
    let invoicedAmount = new Decimal('0');
    let amountReceived = new Decimal('0');
    const rows: StatementRow[] = merged.map((m) => {
      if (m.kind === 'INVOICE') {
        running = running.add(m.total);
        invoicedAmount = invoicedAmount.add(m.total);
        return {
          date: fmtDateLocal(m.date),
          type: 'INVOICE',
          details: `Invoice No ${m.invoiceNumber}`,
          amount: m.total.toFixed(2),
          payment: '0.00',
          balance: running.toFixed(2),
        };
      } else {
        running = running.sub(m.payment);
        amountReceived = amountReceived.add(m.payment);
        return {
          date: fmtDateLocal(m.date),
          type: 'PAYMENT',
          details: `Payment Received $${m.payment.toFixed(2)} on ${fmtDdMmYyyy(m.date)}`,
          amount: '0.00',
          payment: m.payment.toFixed(2),
          balance: running.toFixed(2),
        };
      }
    });

    const balanceDue = openingBalance.add(invoicedAmount).sub(amountReceived);

    return {
      customer: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        address: customer.address ?? null,
        billingEmail1: customer.billingEmail1 ?? null,
        billingEmail2: customer.billingEmail2 ?? null,
      },
      billingCompany: {
        id: billingCompany.id,
        name: billingCompany.name,
        abn: billingCompany.abn ?? null,
        address: billingCompany.address ?? null,
        accountsEmail: billingCompany.accountsEmail ?? null,
        invoiceBcc: billingCompany.invoiceBcc ?? '',
        paymentDetails: billingCompany.paymentDetails ?? null,
      },
      dateFrom,
      dateTo,
      openingBalance: openingBalance.toFixed(2),
      rows,
      summary: {
        invoicedAmount: invoicedAmount.toFixed(2),
        amountReceived: amountReceived.toFixed(2),
        balanceDue: balanceDue.toFixed(2),
      },
    };
  }

  async getSendContext(params: GetParams): Promise<StatementSendContext> {
    const payload = await this.getStatement(params);
    const subject = `Statement for ${payload.customer.name} · ${formatRangeForSubject(payload.dateFrom, payload.dateTo)}`;
    const paymentBlock = payload.billingCompany.paymentDetails
      ? `<div style="margin: 16px 0;">${payload.billingCompany.paymentDetails}</div>`
      : '';
    const html =
      `<p>Hi ${escapeHtml(payload.customer.name)},</p>` +
      `<p>Please find your statement from ${escapeHtml(payload.billingCompany.name)} attached. ` +
      `The balance due is <strong>$${payload.summary.balanceDue}</strong>.</p>` +
      paymentBlock +
      `<p>Thank you.<br/>${escapeHtml(payload.billingCompany.name)}</p>`;
    return {
      from: payload.billingCompany.accountsEmail ?? '',
      to: payload.customer.billingEmail1 ?? '',
      cc: payload.customer.billingEmail2 ?? '',
      bcc: payload.billingCompany.invoiceBcc ?? '',
      subject,
      html,
    };
  }

  async send(params: GetParams, overrides: SendStatementOverrides): Promise<{ messageId: string }> {
    const payload = await this.getStatement(params);
    const { buffer, filename } = await this.pdf.renderStatement({
      customer: {
        customerNumber: payload.customer.customerNumber,
        name: payload.customer.name,
        address: payload.customer.address,
        billingEmail1: payload.customer.billingEmail1,
      },
      billingCompany: {
        name: payload.billingCompany.name,
        abn: payload.billingCompany.abn,
        address: payload.billingCompany.address,
        accountsEmail: payload.billingCompany.accountsEmail,
      },
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      openingBalance: payload.openingBalance,
      rows: payload.rows,
      summary: payload.summary,
    });
    return this.mail.sendStatement({
      customer: { id: payload.customer.id, billingEmail1: payload.customer.billingEmail1 },
      billingCompany: {
        id: payload.billingCompany.id,
        name: payload.billingCompany.name,
        accountsEmail: payload.billingCompany.accountsEmail,
        invoiceBcc: payload.billingCompany.invoiceBcc,
      },
      pdfBuffer: buffer,
      pdfFilename: filename,
      overrides,
    });
  }

  private async computeOpeningBalance(params: {
    customerId: string;
    billingCompanyId: string;
    fromInstant: Date | null;
  }): Promise<Decimal> {
    if (!params.fromInstant) return new Decimal('0');

    const preInvoices = await this.prisma.invoice.findMany({
      where: {
        customerId: params.customerId,
        billingCompanyId: params.billingCompanyId,
        status: { not: 'VOID' as any },
        invoiceDate: { lt: params.fromInstant },
      },
    });
    const invoicedPre = preInvoices.reduce(
      (acc: Decimal, inv: any) => acc.add(new Decimal(inv.totalAmount.toString())),
      new Decimal('0'),
    );

    const preAllocs = await this.prisma.allocation.findMany({
      where: {
        invoice: {
          customerId: params.customerId,
          billingCompanyId: params.billingCompanyId,
          status: { not: 'VOID' as any },
        },
        transaction: { date: { lt: params.fromInstant } },
      },
    });
    const paidPre = preAllocs.reduce(
      (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
      new Decimal('0'),
    );

    return invoicedPre.sub(paidPre);
  }
}
