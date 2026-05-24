import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto, LineItemDto, UpdateInvoiceDto } from './dto';
import { applyDynamicFields } from '../common/dynamic-fields';

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
    const where: any = {};
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
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async nextNumber() {
    const top = await this.prisma.invoice.findFirst({ orderBy: { invoiceNumber: 'desc' } });
    return (top?.invoiceNumber ?? 999) + 1;
  }

  async create(data: CreateInvoiceDto) {
    const totals = computeTotals(data.lineItems);
    const number = await this.nextNumber();
    // Snapshot the parent BillingCompany's template assignment onto every
    // new Invoice so historical renders stay reproducible even if the
    // company's live assignment ever changed (it doesn't today — assignments
    // are immutable post-create — but the snapshot keeps that guarantee
    // local to each invoice).
    let invoiceTemplateId: string | null = null;
    let emailTemplateId: string | null = null;
    if (data.billingCompanyId) {
      const company = await this.prisma.billingCompany.findUnique({
        where: { id: data.billingCompanyId },
        select: { invoiceTemplateId: true, emailTemplateId: true },
      });
      invoiceTemplateId = company?.invoiceTemplateId ?? null;
      emailTemplateId = company?.emailTemplateId ?? null;
    }
    return this.prisma.invoice.create({
      data: {
        invoiceNumber: number,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        customerId: data.customerId || null,
        billingCompanyId: data.billingCompanyId || null,
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
    });
  }

  async update(id: string, data: UpdateInvoiceDto) {
    await this.get(id);
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
      return tx.invoice.update({
        where: { id },
        data: {
          ...headerOnly,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
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
    // Reason is captured in the destructive-confirmation modal. The row is
    // about to disappear so the only place we can keep the audit trail is
    // the server log — grep for "Invoice deleted" if you need to retrace.
    this.log.warn(
      `Invoice deleted: INV-${inv.invoiceNumber} (id=${id}) — reason: ${reason}`,
    );
    await this.prisma.invoice.delete({ where: { id } });
    return { ok: true };
  }

  // Duplicate an existing invoice into a new DRAFT. The clone gets a fresh
  // invoice number, today's date as the invoice date, and the original's due
  // date is left blank — the form's payment-terms effect will recompute it
  // when the user opens the clone. Send-tracking columns are reset.
  async clone(id: string) {
    const src = await this.get(id);
    const number = await this.nextNumber();
    return this.prisma.invoice.create({
      data: {
        invoiceNumber: number,
        invoiceDate: new Date(),
        dueDate: null,
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
    });
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
