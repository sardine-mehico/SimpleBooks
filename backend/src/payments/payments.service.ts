import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { scoreInvoice } from './scoring';
import { findBundleSuggestion } from './bundle';
import { recomputeInvoicePayment } from './recompute';
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
        category: { select: { customerId: true } },
      } as any,
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const allocSum = (tx as any).allocations.reduce(
      (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
      new Decimal(0),
    );
    const unallocated = new Decimal((tx as any).amount.toString()).sub(allocSum);

    // Candidate customer pool: union of vendor.customerId and category.customerId.
    // The +30 categoryCustomerMatch signal only does meaningful ranking work when
    // multiple customers' invoices appear in the candidate list, so we include
    // both linkages and let the scorer discriminate.
    const candidateCustomerIds = new Set<string>();
    const vendorCustomerId: string | null = (tx as any).vendor?.customerId ?? null;
    const categoryCustomerId: string | null = (tx as any).category?.customerId ?? null;
    if (vendorCustomerId) candidateCustomerIds.add(vendorCustomerId);
    if (categoryCustomerId) candidateCustomerIds.add(categoryCustomerId);
    if (candidateCustomerIds.size === 0) {
      return { candidates: [], bundleSuggestion: null };
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { customerId: { in: Array.from(candidateCustomerIds) }, status: { in: OPEN_STATUSES as any } },
      include: { customer: true } as any,
    } as any);

    const candidates: ScoredInvoiceView[] = invoices.map((inv: any) => {
      const score = scoreInvoice(
        {
          description: (tx as any).description,
          unallocated,
          date: (tx as any).date,
          categoryCustomerId,
        },
        {
          invoiceNumber: inv.invoiceNumber,
          amountOutstanding: new Decimal(inv.amountOutstanding.toString()),
          invoiceDate: inv.invoiceDate,
          status: inv.status,
          customerId: inv.customerId,
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

  async applyAllocations(
    transactionId: string,
    allocations: Array<{ invoiceId: string; amount: string }>,
    bindVendorToCustomerId?: string,
  ): Promise<import('./types').ApplyResponse> {
    if (allocations.length === 0) {
      throw new BadRequestException('allocations must not be empty');
    }
    for (const a of allocations) {
      if (!new Decimal(a.amount).gt(0)) {
        throw new BadRequestException('allocation amount must be > 0');
      }
    }

    return this.prisma.$transaction(async (db: any) => {
      const tx = await db.transaction.findUnique({
        where: { id: transactionId },
        include: { allocations: true, vendor: true, account: true },
      });
      if (!tx) throw new NotFoundException('Transaction not found');

      const existingAllocSum = tx.allocations.reduce(
        (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
        new Decimal(0),
      );
      const unallocated = new Decimal(tx.amount.toString()).sub(existingAllocSum);

      const newSum = allocations.reduce(
        (acc, a) => acc.add(new Decimal(a.amount)),
        new Decimal(0),
      );
      if (newSum.gt(unallocated)) {
        throw new BadRequestException(
          `Allocations sum (${newSum.toString()}) exceeds transaction unallocated (${unallocated.toString()})`,
        );
      }

      const invoiceIds = allocations.map((a) => a.invoiceId);
      const invoices = await db.invoice.findMany({ where: { id: { in: invoiceIds } } });
      if (invoices.length !== invoiceIds.length) {
        throw new NotFoundException('One or more invoices not found');
      }
      const invById = new Map<string, any>(invoices.map((i: any) => [i.id, i]));

      for (const line of allocations) {
        const inv = invById.get(line.invoiceId)!;
        if (!OPEN_STATUSES.includes(inv.status)) {
          if (inv.status === 'PAID' || inv.status === 'VOID') {
            throw new ConflictException(`Invoice ${inv.invoiceNumber} status is ${inv.status}`);
          }
          throw new BadRequestException(`Invoice ${inv.invoiceNumber} status is ${inv.status}`);
        }
        const lineAmount = new Decimal(line.amount);
        const outstanding = new Decimal(inv.amountOutstanding.toString());
        if (lineAmount.gt(outstanding)) {
          throw new BadRequestException(
            `Allocation ${lineAmount.toString()} exceeds invoice ${inv.invoiceNumber} outstanding ${outstanding.toString()}`,
          );
        }
      }

      const affectedInvoiceIds = new Set<string>();
      for (const line of allocations) {
        const inv = invById.get(line.invoiceId)!;
        const statusBefore = inv.status;
        await db.allocation.create({
          data: { transactionId, invoiceId: line.invoiceId, amount: new Decimal(line.amount) },
        });
        const allocs = await db.allocation.findMany({ where: { invoiceId: line.invoiceId } });
        const { amountPaid, amountOutstanding, status } = recomputeInvoicePayment(
          {
            status: inv.status,
            totalAmount: new Decimal(inv.totalAmount.toString()),
            viewedAt: inv.viewedAt,
            sendAttempts: inv.sendAttempts ?? 0,
          },
          allocs.map((a: any) => ({ amount: new Decimal(a.amount.toString()) })),
        );
        await db.invoice.update({
          where: { id: line.invoiceId },
          data: { amountPaid, amountOutstanding, status },
        });
        inv.status = status;
        inv.amountPaid = amountPaid;
        inv.amountOutstanding = amountOutstanding;
        await db.allocationEvent.create({
          data: {
            eventType: 'CREATED',
            transactionId,
            invoiceId: line.invoiceId,
            amount: new Decimal(line.amount),
            invoiceStatusBefore: statusBefore,
            invoiceStatusAfter: status,
          },
        });
        affectedInvoiceIds.add(line.invoiceId);
      }

      if (bindVendorToCustomerId && tx.vendor?.id) {
        await db.vendor.update({
          where: { id: tx.vendor.id },
          data: { customerId: bindVendorToCustomerId },
        });
      }

      const updatedInvoices = Array.from(affectedInvoiceIds).map((id) => {
        const inv = invById.get(id)!;
        return {
          id,
          status: inv.status,
          amountPaid: inv.amountPaid.toString(),
          amountOutstanding: inv.amountOutstanding.toString(),
        };
      });
      const newUnallocated = unallocated.sub(newSum);
      return {
        transaction: {
          id: tx.id,
          amount: tx.amount.toString(),
          unallocated: newUnallocated.toString(),
        },
        invoices: updatedInvoices,
      };
    });
  }

  async deleteAllocation(allocationId: string): Promise<void> {
    await this.prisma.$transaction(async (db: any) => {
      const alloc = await db.allocation.findUnique({ where: { id: allocationId } });
      if (!alloc) throw new NotFoundException('Allocation not found');

      const inv = await db.invoice.findUnique({ where: { id: alloc.invoiceId } });
      if (!inv) throw new NotFoundException('Invoice not found');

      const statusBefore = inv.status;
      const snapshot = {
        transactionId: alloc.transactionId,
        invoiceId: alloc.invoiceId,
        amount: new Decimal(alloc.amount.toString()),
      };

      await db.allocation.delete({ where: { id: allocationId } });

      const remaining = await db.allocation.findMany({ where: { invoiceId: alloc.invoiceId } });
      const { amountPaid, amountOutstanding, status } = recomputeInvoicePayment(
        {
          status: inv.status,
          totalAmount: new Decimal(inv.totalAmount.toString()),
          viewedAt: inv.viewedAt,
          sendAttempts: inv.sendAttempts ?? 0,
        },
        remaining.map((a: any) => ({ amount: new Decimal(a.amount.toString()) })),
      );
      await db.invoice.update({
        where: { id: alloc.invoiceId },
        data: { amountPaid, amountOutstanding, status },
      });

      await db.allocationEvent.create({
        data: {
          eventType: 'DELETED',
          transactionId: snapshot.transactionId,
          invoiceId: snapshot.invoiceId,
          amount: snapshot.amount,
          invoiceStatusBefore: statusBefore,
          invoiceStatusAfter: status,
        },
      });
    });
  }

  async getQueue(opts: { showAll?: boolean }): Promise<import('./types').PaymentQueueItem[]> {
    const where: any = { paymentReviewDismissedAt: null };
    if (!opts.showAll) where.category = { kind: 'INCOME' };
    const rows = await this.prisma.transaction.findMany({
      where,
      include: { account: true, vendor: { include: { customer: true } }, allocations: true } as any,
      orderBy: { date: 'desc' },
    } as any);
    return (rows as any[])
      .filter((t) => new Decimal(t.amount.toString()).gt(0))
      .map((t) => {
        const allocSum = (t.allocations ?? []).reduce(
          (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
          new Decimal(0),
        );
        const unallocated = new Decimal(t.amount.toString()).sub(allocSum);
        return {
          id: t.id,
          date: t.date.toISOString().slice(0, 10),
          amount: t.amount.toString(),
          description: t.description,
          accountId: t.accountId,
          accountName: t.account?.name ?? '',
          vendorId: t.vendorId ?? null,
          vendorName: t.vendor?.name ?? null,
          vendorCustomerId: t.vendor?.customerId ?? null,
          vendorCustomerName: t.vendor?.customer?.name ?? null,
          unallocated: unallocated.toString(),
        };
      })
      .filter((r) => new Decimal(r.unallocated).gt(0));
  }

  async getQueueCount(opts: { showAll?: boolean }): Promise<{ count: number }> {
    const list = await this.getQueue(opts);
    return { count: list.length };
  }

  async dismiss(transactionId: string): Promise<void> {
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { paymentReviewDismissedAt: new Date() },
    } as any);
  }

  async undismiss(transactionId: string): Promise<void> {
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { paymentReviewDismissedAt: null },
    } as any);
  }

  async getCustomerCredit(customerId: string): Promise<import('./types').CustomerCreditView> {
    const rows: Array<{ id: string; date: Date; amount: Decimal; description: string; remaining: Decimal }> =
      await this.prisma.$queryRaw`
        SELECT
          t.id, t.date, t.amount, t.description,
          t.amount - COALESCE(SUM(a.amount), 0) AS remaining
        FROM "Transaction" t
        JOIN "Vendor" v ON v.id = t."vendorId"
        LEFT JOIN "Allocation" a ON a."transactionId" = t.id
        WHERE v."customerId" = ${customerId}
          AND t.amount > 0
        GROUP BY t.id
        HAVING t.amount - COALESCE(SUM(a.amount), 0) > 0
        ORDER BY t.date DESC
      ` as any;
    const total = rows.reduce(
      (acc, r) => acc.add(new Decimal(r.remaining.toString())),
      new Decimal(0),
    );
    return {
      credit: total.toString(),
      transactions: rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        amount: r.amount.toString(),
        remaining: r.remaining.toString(),
        description: r.description,
      })),
    };
  }
}
