import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { scoreInvoice } from './scoring';
import { findBundleSuggestion } from './bundle';
import { recomputeInvoicePayment } from './recompute';
import type { CandidatesResponse, ScoredInvoiceView } from './types';

const OPEN_STATUSES = ['SENT', 'VIEWED', 'PARTIAL_PAID'] as const;

const TX_CUSTOMER_INCLUDE = {
  allocations: true,
  account: true,
  category: { select: { customerId: true } },
  linkedCustomer: { select: { id: true } },
  transactionTags: {
    select: {
      tag: { select: { id: true, name: true, color: true, customerId: true } },
    },
  },
} as const;

function extractTagCustomerIds(tx: any): string[] {
  const ids = new Set<string>();
  for (const tt of (tx?.transactionTags ?? []) as any[]) {
    if (tt?.tag?.customerId) ids.add(tt.tag.customerId);
  }
  return Array.from(ids);
}

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async getCandidates(transactionId: string): Promise<CandidatesResponse> {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: TX_CUSTOMER_INCLUDE as any,
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const allocSum = (tx as any).allocations.reduce(
      (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
      new Decimal(0),
    );
    const unallocated = new Decimal((tx as any).amount.toString()).sub(allocSum);

    // Candidate customer pool: union of category.customerId and every
    // tag.customerId on the transaction. Both linkages feed the scorer so
    // ranking can break ties between competing labelled customers.
    const categoryCustomerId: string | null = (tx as any).category?.customerId ?? null;
    const tagCustomerIds = extractTagCustomerIds(tx);
    const linkedCustomerId: string | null = (tx as any).linkedCustomerId ?? null;
    const candidateCustomerIds = new Set<string>();
    if (linkedCustomerId) candidateCustomerIds.add(linkedCustomerId);
    if (categoryCustomerId) candidateCustomerIds.add(categoryCustomerId);
    for (const id of tagCustomerIds) candidateCustomerIds.add(id);

    // Cold-start signals: when category/tag linkage isn't set up yet, pull
    // candidate customers from the description and amount directly so the
    // scorer's invoice-number / exact-amount / name-token signals aren't dead.
    const description: string = (tx as any).description ?? '';
    const invoiceNumberHits = [...description.matchAll(/\bINV[-\s]?(\d{3,6})\b|\b(\d{4,6})\b/gi)]
      .map((m) => Number(m[1] ?? m[2]))
      .filter(Number.isFinite);
    if (invoiceNumberHits.length) {
      const matches = await this.prisma.invoice.findMany({
        where: { invoiceNumber: { in: invoiceNumberHits }, status: { in: OPEN_STATUSES as any } },
        select: { customerId: true },
      });
      for (const m of matches) if (m.customerId) candidateCustomerIds.add(m.customerId);
    }

    const absAmount = unallocated.abs();
    if (absAmount.gt(0)) {
      const amountMatches = await this.prisma.invoice.findMany({
        where: { status: { in: OPEN_STATUSES as any }, amountOutstanding: absAmount as any },
        select: { customerId: true },
        take: 20,
      });
      for (const m of amountMatches) if (m.customerId) candidateCustomerIds.add(m.customerId);
    }

    if (candidateCustomerIds.size === 0) {
      const tokens = description.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
      if (tokens.length) {
        const nameHits = await this.prisma.customer.findMany({
          where: { OR: tokens.map((t) => ({ name: { contains: t, mode: 'insensitive' as const } })) },
          select: { id: true },
          take: 20,
        });
        for (const c of nameHits) candidateCustomerIds.add(c.id);
      }
    }

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
          tagCustomerIds,
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
        include: { allocations: true, account: true },
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
      include: {
        account: true,
        allocations: true,
        category: { select: { customerId: true, customer: { select: { id: true, name: true } } } },
        linkedCustomer: { select: { id: true, name: true } },
        transactionTags: {
          select: {
            tag: {
              select: {
                id: true, name: true, color: true,
                customerId: true,
                customer: { select: { id: true, name: true } },
              },
            },
          },
        },
      } as any,
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
        const tags = (t.transactionTags ?? []).map((tt: any) => ({
          id: tt.tag.id, name: tt.tag.name, color: tt.tag.color ?? null,
        }));
        const directlyLinked = t.linkedCustomer ?? null;
        const categoryCustomer = t.category?.customer ?? null;
        const firstTagWithCustomer = (t.transactionTags ?? [])
          .map((tt: any) => tt.tag)
          .find((tag: any) => tag.customer) ?? null;
        const linked = directlyLinked
          ? { id: directlyLinked.id, name: directlyLinked.name }
          : categoryCustomer
            ? { id: categoryCustomer.id, name: categoryCustomer.name }
            : firstTagWithCustomer?.customer
              ? { id: firstTagWithCustomer.customer.id, name: firstTagWithCustomer.customer.name }
              : null;
        return {
          id: t.id,
          date: t.date.toISOString().slice(0, 10),
          amount: t.amount.toString(),
          description: t.description,
          accountId: t.accountId,
          accountName: t.account?.name ?? '',
          linkedCustomerId: linked?.id ?? null,
          linkedCustomerName: linked?.name ?? null,
          tags,
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
    // Income transactions linked to this customer either via category.customerId
    // or via any tag.customerId, with positive unallocated remainder.
    const rows: Array<{ id: string; date: Date; amount: Decimal; description: string; remaining: Decimal }> =
      await this.prisma.$queryRaw`
        SELECT
          t.id, t.date, t.amount, t.description,
          t.amount - COALESCE(SUM(a.amount), 0) AS remaining
        FROM "Transaction" t
        LEFT JOIN "Category" c ON c.id = t."categoryId"
        LEFT JOIN "Allocation" a ON a."transactionId" = t.id
        WHERE (
          c."customerId" = ${customerId}
          OR EXISTS (
            SELECT 1 FROM "TransactionTag" tt
            JOIN "Tag" tag ON tag.id = tt."tagId"
            WHERE tt."transactionId" = t.id AND tag."customerId" = ${customerId}
          )
        )
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
