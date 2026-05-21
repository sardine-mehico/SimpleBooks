import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Subset of the Invoice graph that the customer-facing public page actually
// renders. Mirrors the shape consumed by the frontend's <PublicInvoiceView>;
// keep them in lockstep with `frontend/components/public-invoice/types.ts`.
export type PublicInvoiceDto = {
  invoiceNumber: number;
  invoiceDate: string;
  dueDate: string | null;
  status: 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID';
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  poNumber: string | null;
  paymentDetails: string | null;
  terms: string | null;
  invoiceTemplate: { templateKey: string } | null;
  customer: { name: string; address: string | null; billingEmail1: string | null } | null;
  billingCompany: {
    name: string;
    abn: string | null;
    address: string | null;
    accountsEmail: string | null;
  } | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineAmount: number;
    taxName: string | null;
    taxRate: number | null;
    taxAmount: number;
  }>;
};

@Injectable()
export class PublicInvoicesService {
  constructor(private prisma: PrismaService) {}

  // Resolve the invoice this token belongs to, idempotently transition
  // SENT → VIEWED on first hit, and return the slimmed-down public DTO.
  // Throws NotFound for: unknown token, DRAFT (not yet shared), VOID. The
  // identical 404 shape across all three keeps the row's existence invisible
  // to anyone guessing.
  async getByToken(token: string): Promise<PublicInvoiceDto> {
    const inv = await this.prisma.invoice.findUnique({
      where: { publicToken: token },
      include: {
        customer: true,
        billingCompany: true,
        invoiceTemplate: true,
        lineItems: { orderBy: { position: 'asc' } },
      },
    });
    if (!inv) throw new NotFoundException();
    if (inv.status === 'DRAFT' || inv.status === 'VOID' || inv.status === 'FAILED_TO_SEND') {
      throw new NotFoundException();
    }

    // First view of a SENT invoice → flip to VIEWED. Guarded on SENT only so
    // PARTIAL_PAID / PAID are never downgraded by a later open.
    if (inv.viewedAt == null && inv.status === 'SENT') {
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: { viewedAt: new Date(), status: 'VIEWED' },
      });
      inv.viewedAt = new Date();
      inv.status = 'VIEWED';
    }

    return {
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      status: inv.status as PublicInvoiceDto['status'],
      subtotal: Number(inv.subtotal),
      taxAmount: Number(inv.taxAmount),
      totalAmount: Number(inv.totalAmount),
      poNumber: inv.poNumber,
      paymentDetails: inv.paymentDetails,
      terms: inv.terms,
      invoiceTemplate: inv.invoiceTemplate
        ? { templateKey: inv.invoiceTemplate.templateKey }
        : null,
      customer: inv.customer
        ? {
            name: inv.customer.name,
            address: inv.customer.address,
            billingEmail1: inv.customer.billingEmail1,
          }
        : null,
      billingCompany: inv.billingCompany
        ? {
            name: inv.billingCompany.name,
            abn: inv.billingCompany.abn,
            address: inv.billingCompany.address,
            accountsEmail: inv.billingCompany.accountsEmail,
          }
        : null,
      lineItems: inv.lineItems.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        lineAmount: Number(l.lineAmount),
        taxName: l.taxName,
        taxRate: l.taxRate != null ? Number(l.taxRate) : null,
        taxAmount: Number(l.taxAmount),
      })),
    };
  }

  // Resolve an invoice id from a public token. Used by the public PDF endpoint
  // so it can hand off to the existing PdfService without duplicating the
  // status guards. Same 404 semantics as `getByToken`.
  async resolveInvoiceId(token: string): Promise<string> {
    const inv = await this.prisma.invoice.findUnique({
      where: { publicToken: token },
      select: { id: true, status: true },
    });
    if (!inv) throw new NotFoundException();
    if (inv.status === 'DRAFT' || inv.status === 'VOID' || inv.status === 'FAILED_TO_SEND') {
      throw new NotFoundException();
    }
    return inv.id;
  }
}
