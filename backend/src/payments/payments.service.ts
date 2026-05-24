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
}
