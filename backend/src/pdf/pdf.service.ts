import * as React from 'react';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { renderToBuffer } from '@react-pdf/renderer';
import { PrismaService } from '../prisma/prisma.service';
import { getTemplateComponent } from './templates';
import type {
  PdfCompany,
  PdfCustomer,
  PdfInvoice,
  PdfLineItem,
} from './templates/types';

// Soft target — we log when a rendered PDF crosses this threshold per page so
// we notice as fonts/images get added to bespoke templates. Doesn't fail the
// render (a generous over-budget receipt is better than no PDF at all).
const SIZE_BUDGET_BYTES_PER_PAGE = 180 * 1024;

@Injectable()
export class PdfService {
  private readonly log = new Logger(PdfService.name);

  constructor(private prisma: PrismaService) {}

  async renderInvoice(invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        billingCompany: true,
        invoiceTemplate: true,
        lineItems: { orderBy: { position: 'asc' } },
      },
    });
    if (!inv) throw new NotFoundException();

    const templateKey =
      inv.invoiceTemplate?.templateKey ??
      inv.billingCompany?.invoiceTemplateId ??
      null;
    const Component = getTemplateComponent(inv.invoiceTemplate?.templateKey ?? null);

    const invoice: PdfInvoice = {
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      poNumber: inv.poNumber,
      paymentDetails: inv.paymentDetails,
      terms: inv.terms,
      subtotal: inv.subtotal as unknown as number,
      taxAmount: inv.taxAmount as unknown as number,
      totalAmount: inv.totalAmount as unknown as number,
      lineItems: inv.lineItems.map<PdfLineItem>((l) => ({
        description: l.description,
        quantity: l.quantity as unknown as number,
        unitPrice: l.unitPrice as unknown as number,
        lineAmount: l.lineAmount as unknown as number,
        taxName: l.taxName,
        taxRate: l.taxRate as unknown as number | null,
        taxAmount: l.taxAmount as unknown as number,
      })),
    };
    const company: PdfCompany = inv.billingCompany
      ? {
          name: inv.billingCompany.name,
          abn: inv.billingCompany.abn,
          address: inv.billingCompany.address,
          accountsEmail: inv.billingCompany.accountsEmail,
        }
      : null;
    const customer: PdfCustomer = inv.customer
      ? {
          name: inv.customer.name,
          address: inv.customer.address,
          billingEmail1: inv.customer.billingEmail1,
        }
      : null;

    const element = React.createElement(Component, { invoice, company, customer });
    const buffer = await renderToBuffer(element as React.ReactElement);

    // Best-effort page-count estimate from the buffer. Good enough for the
    // size-budget warning; we don't open a second PDF parser just for this.
    const pageCount = countPdfPages(buffer);
    const bytesPerPage = buffer.byteLength / Math.max(pageCount, 1);
    if (bytesPerPage > SIZE_BUDGET_BYTES_PER_PAGE) {
      this.log.warn(
        `INV-${invoice.invoiceNumber} (templateKey=${templateKey ?? 'default'}) rendered to ${buffer.byteLength}B across ${pageCount} page(s) — ${Math.round(bytesPerPage / 1024)}KB/page exceeds 180KB target.`,
      );
    }

    return {
      buffer,
      filename: `INV-${invoice.invoiceNumber}.pdf`,
    };
  }
}

// Count "/Type /Page" occurrences in the raw PDF bytes. PDFs always include
// page objects with that tag; the `/Pages` parent uses "/Type /Pages" (plural)
// which is filtered out by the trailing whitespace requirement.
function countPdfPages(buf: Buffer): number {
  const haystack = buf.toString('latin1');
  const matches = haystack.match(/\/Type\s*\/Page[\s\/>]/g);
  return matches ? matches.length : 1;
}
