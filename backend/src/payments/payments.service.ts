import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { scoreInvoice } from './scoring';
import { findBundleSuggestion } from './bundle';
import type { CandidatesResponse, ScoredInvoiceView } from './types';

const OPEN_STATUSES = ['SENT', 'VIEWED', 'PARTIAL_PAID'] as const;

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async getCandidates(transactionId: string): Promise<CandidatesResponse> {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        allocations: true,
        vendor: true,
        account: true,
      } as any,
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const allocSum = (tx as any).allocations.reduce(
      (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
      new Decimal(0),
    );
    const unallocated = new Decimal((tx as any).amount.toString()).sub(allocSum);

    const customerId: string | null = (tx as any).vendor?.customerId ?? null;
    if (!customerId) {
      return { candidates: [], bundleSuggestion: null };
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { customerId, status: { in: OPEN_STATUSES as any } },
    } as any);

    const candidates: ScoredInvoiceView[] = invoices.map((inv: any) => {
      const score = scoreInvoice(
        {
          description: (tx as any).description,
          unallocated,
          date: (tx as any).date,
        },
        {
          invoiceNumber: inv.invoiceNumber,
          amountOutstanding: new Decimal(inv.amountOutstanding.toString()),
          invoiceDate: inv.invoiceDate,
          status: inv.status,
        },
        { displayName: inv.customer?.name ?? '' },
      );
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate.toISOString().slice(0, 10),
        totalAmount: inv.totalAmount.toString(),
        amountOutstanding: inv.amountOutstanding.toString(),
        status: inv.status,
        customerId: inv.customerId,
        customerName: inv.customer?.name ?? null,
        score: score.total,
        signals: score.signals,
      };
    });
    candidates.sort((a, b) => b.score - a.score);

    const bundle = findBundleSuggestion(
      unallocated,
      invoices.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amountOutstanding: new Decimal(inv.amountOutstanding.toString()),
        invoiceDate: inv.invoiceDate,
      })),
    );

    return {
      candidates,
      bundleSuggestion: bundle && {
        invoiceIds: bundle.invoices.map((i) => i.id),
        invoices: bundle.invoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          amountOutstanding: i.amountOutstanding.toString(),
        })),
        total: bundle.total.toString(),
      },
    };
  }
}
