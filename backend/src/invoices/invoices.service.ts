import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PaymentTerms } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto, LineItemDto, UpdateInvoiceDto } from './dto';
import { applyDynamicFields } from '../common/dynamic-fields';
import { assertIfMatch } from '../common/etag';
import { paymentTermsOffsetDays } from '../common/payment-terms.util';

const PAYMENT_TERM_DAYS: Record<PaymentTerms, number> = {
  IN_28_DAYS: 28,
  IN_15_DAYS: 15,
  IN_7_DAYS: 7,
  DUE_ON_RECEIPT: 0,
};

const MANUAL_STATUSES = new Set<InvoiceStatus>(['DRAFT']);

function deriveDueDate(invoiceDate: Date, terms: PaymentTerms | null | undefined): Date | null {
  if (!terms) return null;
  const d = new Date(invoiceDate);
  d.setDate(d.getDate() + (PAYMENT_TERM_DAYS[terms] ?? 0));
  return d;
}

function computeLine(line: LineItemDto) {
  const lineAmount = +(line.quantity * line.unitPrice).toFixed(2);
  const taxAmount = +(lineAmount * ((line.taxRate ?? 0) / 100)).toFixed(2);
  return { lineAmount, taxAmount };
}

function computeTotals(lines: LineItemDto[]) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const l of lines) {
    const c = computeLine(l);
    subtotal += c.lineAmount;
    taxAmount += c.taxAmount;
  }
  subtotal = +subtotal.toFixed(2);
  taxAmount = +taxAmount.toFixed(2);
  return { subtotal, taxAmount, totalAmount: +(subtotal + taxAmount).toFixed(2) };
}

@Injectable()
export class InvoicesService {
  private readonly log = new Logger(InvoicesService.name);

  constructor(private prisma: PrismaService) {}

  list(opts?: { openOnly?: boolean; search?: string }) {
    const where: any = { deletedAt: null };
    if (opts?.openOnly) {
      where.status = { in: ['SENT', 'VIEWED', 'PARTIAL_PAID'] };
    }
    if (opts?.search) {
      const s = opts.search.trim();
      const or: any[] = [
        { customer: { is: { name: { contains: s, mode: 'insensitive' } } } },
      ];
      const asNum = Number(s.replace(/^INV-/i, ''));
      if (Number.isFinite(asNum) && asNum > 0) or.push({ invoiceNumber: asNum });
      where.OR = or;
    }
    return this.prisma.invoice.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { invoiceNumber: 'desc' },
      include: { customer: true, billingCompany: true },
    });
  }

  async get(id: string) {
    const row = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        billingCompany: true,
        lineItems: { orderBy: { position: 'asc' } },
        // Allocations + a thin transaction snippet so the invoice view can
        // render the Allocations panel (Task 21) without a second round-trip.
        // Ordered newest-first to match the panel's display order.
        allocations: {
          orderBy: { createdAt: 'desc' },
          include: {
            transaction: { select: { date: true, description: true } },
          },
        },
      },
    });
    if (!row || row.deletedAt) throw new NotFoundException();
    return row;
  }

  // Atomically allocate the next invoice number and run the caller's
  // build(number) callback inside the same transaction. We take a
  // pg_advisory_xact_lock at a fixed key (7301) so concurrent invoice
  // creators serialize through this lock instead of racing on MAX+1.
  // The lock is released when the transaction commits or rolls back.
  // Combined with the `@unique` constraint, this guarantees no two
  // invoices ever get the same number under any load.
  private async createWithNumber<T>(
    build: (tx: any, number: number) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(7301)`);
      const top = await tx.invoice.findFirst({ orderBy: { invoiceNumber: 'desc' } });
      const number = (top?.invoiceNumber ?? 999) + 1;
      return build(tx, number);
    });
  }

  // Expand line.taxTypeId → taxName/taxRate so tax math is symmetric with the
  // ad-hoc taxName+taxRate path. UI sends both already; raw API callers often
  // send only taxTypeId and would otherwise silently get zero tax.
  private async expandTaxTypes(lines: LineItemDto[]) {
    const needsExpand = lines.filter((l) => l.taxTypeId && l.taxRate == null);
    if (!needsExpand.length) return;
    const ids = [...new Set(needsExpand.map((l) => l.taxTypeId!))];
    const types = await this.prisma.taxType.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, rate: true },
    });
    const byId = new Map(types.map((t) => [t.id, t]));
    for (const l of needsExpand) {
      const t = byId.get(l.taxTypeId!);
      if (!t) continue;
      l.taxName = l.taxName ?? t.name;
      l.taxRate = Number(t.rate);
    }
  }

  async create(data: CreateInvoiceDto) {
    let customer: { billingCompanyId: string | null; paymentTerms: PaymentTerms } | null = null;
    if (data.customerId) {
      customer = await this.prisma.customer.findUnique({
        where: { id: data.customerId },
        select: { billingCompanyId: true, paymentTerms: true },
      });
    }

    const billingCompanyId = data.billingCompanyId ?? customer?.billingCompanyId ?? null;

    let invoiceTemplateId: string | null = null;
    let emailTemplateId: string | null = null;
    if (billingCompanyId) {
      const company = await this.prisma.billingCompany.findUnique({
        where: { id: billingCompanyId },
        select: { invoiceTemplateId: true, emailTemplateId: true },
      });
      invoiceTemplateId = company?.invoiceTemplateId ?? null;
      emailTemplateId = company?.emailTemplateId ?? null;
    }

    await this.expandTaxTypes(data.lineItems);
    const totals = computeTotals(data.lineItems);
    const invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : new Date();
    const dueDate = data.dueDate
      ? new Date(data.dueDate)
      : deriveDueDate(invoiceDate, customer?.paymentTerms);

    return this.createWithNumber((tx, number) => tx.invoice.create({
      data: {
        invoiceNumber: number,
        invoiceDate,
        dueDate,
        customerId: data.customerId || null,
        billingCompanyId,
        invoiceTemplateId,
        emailTemplateId,
        status: data.status ?? 'DRAFT',
        poNumber: data.poNumber,
        paymentDetails: data.paymentDetails,
        internalNotes: data.internalNotes,
        terms: data.terms,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        amountPaid: 0,
        amountOutstanding: totals.totalAmount,
        lineItems: {
          create: data.lineItems.map((l, idx) => {
            const c = computeLine(l);
            return {
              itemId: l.itemId || null,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineAmount: c.lineAmount,
              taxTypeId: l.taxTypeId,
              taxName: l.taxName,
              taxRate: l.taxRate,
              taxAmount: c.taxAmount,
              position: idx,
            };
          }),
        },
      },
      include: { lineItems: true },
    }));
  }

  async update(id: string, data: UpdateInvoiceDto, ifMatch?: string) {
    const existing = await this.get(id);
    assertIfMatch(existing.updatedAt, ifMatch);
    if (data.status && !MANUAL_STATUSES.has(data.status)) {
      throw new BadRequestException(
        `Status '${data.status}' is derived from allocations or send activity and cannot be set manually. Use POST /invoices/:id/void to void; PAID/PARTIAL_PAID/SENT/VIEWED are managed by the payments and send pipelines.`,
      );
    }
    if (data.lineItems) await this.expandTaxTypes(data.lineItems);
    const headerOnly = {
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      customerId: data.customerId === '' ? null : data.customerId,
      billingCompanyId: data.billingCompanyId === '' ? null : data.billingCompanyId,
      status: data.status,
      poNumber: data.poNumber,
      paymentDetails: data.paymentDetails,
      internalNotes: data.internalNotes,
      terms: data.terms,
    };

    if (!data.lineItems) {
      return this.prisma.invoice.update({
        where: { id },
        data: headerOnly,
        include: { lineItems: true },
      });
    }

    const totals = computeTotals(data.lineItems);
    return this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      const cur = await tx.invoice.findUnique({ where: { id }, select: { amountPaid: true } });
      const paid = Number(cur?.amountPaid ?? 0);
      return tx.invoice.update({
        where: { id },
        data: {
          ...headerOnly,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          amountOutstanding: Math.max(0, +(totals.totalAmount - paid).toFixed(2)),
          lineItems: {
            create: data.lineItems!.map((l, idx) => {
              const c = computeLine(l);
              return {
                itemId: l.itemId || null,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                lineAmount: c.lineAmount,
                taxTypeId: l.taxTypeId,
                taxName: l.taxName,
                taxRate: l.taxRate,
                taxAmount: c.taxAmount,
                position: idx,
              };
            }),
          },
        },
        include: { lineItems: true },
      });
    });
  }

  async remove(id: string, reason: string) {
    const inv = await this.get(id);
    // Soft-delete: stamp deletedAt; lists/get filter rows with non-null
    // deletedAt out. The reason is captured in the destructive-confirmation
    // modal and goes to the server log so the audit trail survives even after
    // the 30-day sweep hard-deletes the row.
    this.log.warn(
      `Invoice moved to trash: INV-${inv.invoiceNumber} (id=${id}) — reason: ${reason}`,
    );
    await this.prisma.invoice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  // List rows in the trash. UI surfaces these on /invoices/trash with restore
  // and "Empty trash" actions.
  async listTrash() {
    return this.prisma.invoice.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      include: { customer: true, billingCompany: true },
    });
  }

  // Restore a soft-deleted invoice. Idempotent on rows already restored.
  async restore(id: string) {
    const row = await this.prisma.invoice.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    await this.prisma.invoice.update({
      where: { id },
      data: { deletedAt: null },
    });
    this.log.log(`Invoice restored: INV-${row.invoiceNumber} (id=${id})`);
    return { ok: true };
  }

  // Hard-delete (irreversible). Only allowed on already-trashed rows so a
  // user can't accidentally bypass the soft-delete safety.
  async purge(id: string) {
    const row = await this.prisma.invoice.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    if (!row.deletedAt) {
      throw new BadRequestException(
        'Invoice must be in the trash before it can be purged. Use DELETE /invoices/:id first.',
      );
    }
    this.log.warn(`Invoice purged: INV-${row.invoiceNumber} (id=${id})`);
    await this.prisma.invoice.delete({ where: { id } });
    return { ok: true };
  }

  // Sweep — hard-delete rows soft-deleted ≥ 30 days ago. Called by the
  // recurring sweep so it runs daily without needing a separate cron.
  async sweepTrash(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.invoice.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.log.log(`Trash sweep: hard-deleted ${result.count} invoice(s) older than 30 days`);
    }
    return result.count;
  }

  // Duplicate an existing invoice into a new DRAFT. The clone gets a fresh
  // invoice number, today's date as the invoice date, and the due date is
  // computed from the customer's `paymentTerms` so the form opens with a
  // correct value (the form's recompute effect only fires on changes after
  // mount, so leaving dueDate null here used to leave the form blank).
  // Send-tracking columns are reset.
  async clone(id: string) {
    const src = await this.get(id);
    const invoiceDate = new Date();
    invoiceDate.setHours(0, 0, 0, 0);
    const offset = paymentTermsOffsetDays(src.customer?.paymentTerms ?? null);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + offset);
    return this.createWithNumber((tx, number) => tx.invoice.create({
      data: {
        invoiceNumber: number,
        invoiceDate,
        dueDate,
        customerId: src.customerId,
        billingCompanyId: src.billingCompanyId,
        // Carry forward the source invoice's template snapshot — keeps the
        // clone visually identical to the original until the user manually
        // re-assigns by changing customer/company.
        invoiceTemplateId: src.invoiceTemplateId,
        emailTemplateId: src.emailTemplateId,
        status: 'DRAFT',
        poNumber: src.poNumber,
        paymentDetails: src.paymentDetails,
        internalNotes: src.internalNotes,
        terms: src.terms,
        subtotal: src.subtotal,
        taxAmount: src.taxAmount,
        totalAmount: src.totalAmount,
        lineItems: {
          create: src.lineItems.map((l) => ({
            itemId: l.itemId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineAmount: l.lineAmount,
            taxTypeId: l.taxTypeId,
            taxName: l.taxName,
            taxRate: l.taxRate,
            taxAmount: l.taxAmount,
            position: l.position,
          })),
        },
      },
      include: { lineItems: true },
    }));
  }

  // Cancel an invoice. The row stays in the system so the audit trail is
  // preserved, but its amounts are excluded from dashboard aggregates (which
  // only sum PAID / SENT / VIEWED / PARTIAL_PAID — see dashboard.service.ts).
  // `reason` is captured in the destructive-confirmation modal and persisted
  // on the row for forever-readable audit. Re-voiding an already-VOID
  // invoice is allowed — the new reason / voidedAt overwrite (treat as
  // "reason updated").
  async void(id: string, reason: string) {
    await this.get(id);
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'VOID', voidReason: reason, voidedAt: new Date() },
      include: { lineItems: true },
    });
  }

  // Manually flip an invoice into SENT without going through the email send
  // pipeline. Useful when the operator delivered the invoice via another
  // channel (printed, hand-delivered, sent from a different email account).
  // Allowed transitions: DRAFT → SENT, FAILED_TO_SEND → SENT.
  // Any other status returns 409 — once SENT/VIEWED/PARTIAL_PAID/PAID/VOID,
  // the manual override is rejected so it can't accidentally roll history
  // back. Use Void to retire instead.
  async markAsSent(id: string) {
    const existing = await this.get(id);
    if (existing.status !== 'DRAFT' && existing.status !== 'FAILED_TO_SEND') {
      throw new ConflictException(
        `Only DRAFT or FAILED_TO_SEND invoices can be marked as Sent; this one is ${existing.status}.`,
      );
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'SENT', lastSendAt: new Date() },
      include: { lineItems: true },
    });
  }

  // Pre-fill payload for the Send Invoice dialog. Loads the assigned
  // EmailTemplate via the snapshot, substitutes dynamic-fields tokens against
  // this invoice's context, and returns the values the dialog inputs should
  // open with. The dialog can edit any of these before posting back.
  async sendContext(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, billingCompany: true, emailTemplate: true },
    });
    if (!inv) throw new NotFoundException();

    // Mint the public token here too if missing so the dialog preview shows
    // the exact link the customer will see (rather than the literal
    // `{{invoice link}}` placeholder). MailService.sendInvoice still mints
    // lazily as a backstop for any code path that bypasses sendContext.
    let publicToken = inv.publicToken;
    if (!publicToken) {
      publicToken = randomBytes(32).toString('base64url');
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: { publicToken, publicTokenIssuedAt: new Date() },
      });
    }
    const appUrl = (process.env.PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    const invoiceLink = `${appUrl}/i/${publicToken}`;

    const ctx = {
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      invoiceNumber: `INV-${inv.invoiceNumber}`,
      customerName: inv.customer?.name ?? null,
      billingCompany: inv.billingCompany?.name ?? null,
      accountsEmail: inv.billingCompany?.accountsEmail ?? null,
      invoiceLink,
    };
    return {
      from: inv.billingCompany?.accountsEmail ?? '',
      to: inv.customer?.billingEmail1 ?? '',
      // CC defaults to the customer's secondary billing email; BCC defaults
      // to the billing company's "Invoice Backup Email (BCC)" so every
      // outgoing invoice copies the operator's archive address by default.
      cc: inv.customer?.billingEmail2 ?? '',
      bcc: inv.billingCompany?.invoiceBcc ?? '',
      subject: applyDynamicFields(
        inv.emailTemplate?.subject ?? `Invoice INV-${inv.invoiceNumber}`,
        ctx,
      ),
      html: applyDynamicFields(inv.emailTemplate?.body ?? '', ctx),
      templateName: inv.emailTemplate?.name ?? null,
    };
  }
}
