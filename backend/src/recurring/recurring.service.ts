import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PreferencesService } from '../preferences/preferences.service';
import { RECURRING_QUEUE } from './recurring.constants';
import { CreateRecurringRuleDto, UpdateRecurringRuleDto } from './dto';
import { assertIfMatch } from '../common/etag';

@Injectable()
export class RecurringService implements OnModuleInit {
  private readonly log = new Logger(RecurringService.name);

  constructor(
    private prisma: PrismaService,
    private prefs: PreferencesService,
    @InjectQueue(RECURRING_QUEUE) private queue: Queue,
  ) {}

  async onModuleInit() {
    let tz = 'UTC';
    try {
      tz = await this.prefs.getTimezone();
    } catch (e) {
      this.log.warn(`Could not read preferences (using UTC): ${(e as Error).message}`);
    }
    this.log.log(`Scheduling recurring sweep in timezone ${tz}`);
    await this.queue.add(
      'sweep',
      {},
      {
        repeat: { pattern: '* * * * *', tz },
        removeOnComplete: 100,
        removeOnFail: 50,
        jobId: 'recurring-sweep',
      },
    );
  }

  list() {
    return this.prisma.recurringRule.findMany({
      orderBy: [{ active: 'desc' }, { scheduleName: 'asc' }],
      include: { customer: true, billingCompany: true, recurringSchedule: true, lineItems: true },
    });
  }

  async get(id: string) {
    const row = await this.prisma.recurringRule.findUnique({
      where: { id },
      include: {
        customer: { include: { billingCompany: true } },
        billingCompany: true,
        recurringSchedule: true,
        lineItems: { orderBy: { position: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async deriveScheduleName(customerId: string, scheduleId: string): Promise<string> {
    const [customer, schedule] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.recurringSchedule.findUnique({ where: { id: scheduleId } }),
    ]);
    const c = customer?.name ?? 'Unknown customer';
    const s = schedule?.name ?? 'Unknown schedule';
    return `${c} - ${s}`;
  }

  async create(data: CreateRecurringRuleDto) {
    // Resolve customer + billing company at save (mirrors how invoices store
    // `billingCompanyId` derived from the customer's link).
    const customer = await this.prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { billingCompanyId: true },
    });
    const scheduleName = await this.deriveScheduleName(data.customerId, data.recurringScheduleId);
    // Prefill from Settings → Terms unless the caller supplied their own
    // (same semantics as InvoicesService.create).
    const terms = data.terms !== undefined ? data.terms : await this.prefs.getDefaultInvoiceTerms();

    return this.prisma.recurringRule.create({
      data: {
        scheduleName,
        startDate: new Date(data.startDate),
        recurringScheduleId: data.recurringScheduleId,
        sendingOption: data.sendingOption ?? 'REVIEW_BEFORE_SENDING',
        active: data.active ?? true,
        // First run aligns with startDate. Once the sweep processes it,
        // `nextRunAt` advances by the schedule's interval.
        nextRunAt: new Date(data.startDate),
        customerId: data.customerId,
        billingCompanyId: customer?.billingCompanyId ?? null,
        poNumber: data.poNumber,
        paymentDetails: data.paymentDetails,
        internalNotes: data.internalNotes,
        terms,
        lineItems: {
          create: data.lineItems.map((l, idx) => ({
            itemId: l.itemId || null,
            description: l.description,
            unitPrice: l.unitPrice,
            taxTypeId: l.taxTypeId,
            taxName: l.taxName,
            taxRate: l.taxRate,
            position: idx,
          })),
        },
      },
      include: { lineItems: true },
    });
  }

  async update(id: string, data: UpdateRecurringRuleDto, ifMatch?: string) {
    const existing = await this.get(id);
    assertIfMatch(existing.updatedAt, ifMatch);

    // Re-derive scheduleName if customer or schedule changed.
    let scheduleName: string | undefined;
    const nextCustomerId = data.customerId ?? existing.customerId;
    const nextScheduleId = data.recurringScheduleId ?? existing.recurringScheduleId;
    if (nextCustomerId && nextScheduleId) {
      if (data.customerId !== undefined || data.recurringScheduleId !== undefined) {
        scheduleName = await this.deriveScheduleName(nextCustomerId, nextScheduleId);
      }
    }

    // Re-resolve billingCompanyId when customer changes.
    let billingCompanyId: string | null | undefined;
    if (data.customerId !== undefined && data.customerId !== existing.customerId) {
      const customer = data.customerId
        ? await this.prisma.customer.findUnique({ where: { id: data.customerId }, select: { billingCompanyId: true } })
        : null;
      billingCompanyId = customer?.billingCompanyId ?? null;
    }

    const headerOnly = {
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      recurringScheduleId: data.recurringScheduleId,
      sendingOption: data.sendingOption,
      active: data.active,
      customerId: data.customerId,
      billingCompanyId,
      poNumber: data.poNumber,
      paymentDetails: data.paymentDetails,
      internalNotes: data.internalNotes,
      terms: data.terms,
      scheduleName,
    };

    if (!data.lineItems) {
      return this.prisma.recurringRule.update({
        where: { id },
        data: headerOnly,
        include: { lineItems: true },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.recurringRuleLineItem.deleteMany({ where: { recurringRuleId: id } });
      return tx.recurringRule.update({
        where: { id },
        data: {
          ...headerOnly,
          lineItems: {
            create: data.lineItems!.map((l, idx) => ({
              itemId: l.itemId || null,
              description: l.description,
              unitPrice: l.unitPrice,
              taxTypeId: l.taxTypeId,
              taxName: l.taxName,
              taxRate: l.taxRate,
              position: idx,
            })),
          },
        },
        include: { lineItems: true },
      });
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.recurringRule.delete({ where: { id } });
    return { ok: true };
  }
}
