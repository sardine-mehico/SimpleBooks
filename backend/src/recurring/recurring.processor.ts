import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { InvoiceMailService } from '../mail/invoice-mail.service';
import { paymentTermsOffsetDays } from '../common/payment-terms.util';
import { applyDynamicFields } from '../common/dynamic-fields.util';
import { RECURRING_QUEUE } from './recurring.constants';

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMonths(d: Date, months: number): Date {
  // Calendar-month math with day-of-month clamping (Jan 31 + 1 month = Feb 28/29).
  const out = new Date(d);
  const targetMonth = out.getMonth() + months;
  const targetYear = out.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastOfTarget = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  out.setFullYear(targetYear, normalizedMonth, Math.min(out.getDate(), lastOfTarget));
  return out;
}

function advanceNextRun(current: Date, unit: string, count: number): Date {
  switch (unit) {
    case 'DAYS':   return addDays(current, count);
    case 'WEEKS':  return addDays(current, count * 7);
    case 'MONTHS': return addMonths(current, count);
    case 'YEARS':  return addMonths(current, count * 12);
    default:       return addDays(current, count);
  }
}

@Processor(RECURRING_QUEUE)
export class RecurringProcessor extends WorkerHost {
  private readonly log = new Logger(RecurringProcessor.name);

  constructor(
    private prisma: PrismaService,
    private invoices: InvoicesService,
    private invoiceMail: InvoiceMailService,
  ) {
    super();
  }

  async process(_job: Job) {
    const now = new Date();
    // Daily trash sweep — runs cheaply on every tick (no-op when no rows
    // qualify); 30-day cutoff lives in InvoicesService.sweepTrash.
    try {
      await this.invoices.sweepTrash();
    } catch (e) {
      this.log.warn(`Trash sweep failed (will retry next tick): ${(e as Error).message}`);
    }
    const due = await this.prisma.recurringRule.findMany({
      where: { active: true, nextRunAt: { lte: now } },
      include: {
        customer: { include: { billingCompany: true } },
        recurringSchedule: true,
        lineItems: { orderBy: { position: 'asc' } },
      },
    });

    for (const rule of due) {
      // Skip conditions — log and leave nextRunAt alone for next sweep.
      if (!rule.customer) {
        this.log.warn(`Skip rule ${rule.id}: customer missing`);
        continue;
      }
      if (!rule.customer.billingCompany) {
        this.log.warn(`Skip rule ${rule.id}: customer has no billing company`);
        continue;
      }
      if (!rule.recurringSchedule) {
        this.log.warn(`Skip rule ${rule.id}: schedule missing`);
        continue;
      }
      if (rule.lineItems.length === 0) {
        this.log.warn(`Skip rule ${rule.id}: no line items`);
        continue;
      }

      // Dates.
      const invoiceDate = new Date(now);
      invoiceDate.setHours(0, 0, 0, 0);
      const dueDate = addDays(invoiceDate, paymentTermsOffsetDays(rule.customer.paymentTerms));

      // Build CreateInvoiceDto — token-resolved descriptions, qty=1, unitPrice=amount.
      const dto = {
        invoiceDate: invoiceDate.toISOString(),
        dueDate: dueDate.toISOString(),
        customerId: rule.customerId ?? undefined,
        billingCompanyId: rule.billingCompanyId ?? undefined,
        status: 'DRAFT' as const,
        poNumber: rule.poNumber ?? undefined,
        paymentDetails: rule.paymentDetails ?? undefined,
        internalNotes: rule.internalNotes ?? undefined,
        terms: rule.terms ?? undefined,
        lineItems: rule.lineItems.map((l) => ({
          itemId: l.itemId ?? undefined,
          description: applyDynamicFields(l.description, { invoiceDate, dueDate }),
          quantity: 1,
          unitPrice: Number(l.unitPrice),
          taxTypeId: l.taxTypeId ?? undefined,
          taxName: l.taxName ?? undefined,
          taxRate: l.taxRate != null ? Number(l.taxRate) : undefined,
        })),
      };

      let invoice: { id: string; invoiceNumber: number };
      try {
        invoice = (await this.invoices.create(dto as any)) as { id: string; invoiceNumber: number };
      } catch (e) {
        this.log.error(`Rule ${rule.id} invoice create failed: ${(e as Error).message}`);
        continue; // don't advance nextRunAt — try again next sweep
      }

      // Stamp back-reference (InvoicesService.create doesn't accept recurringRuleId in its DTO).
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { recurringRuleId: rule.id },
      });
      this.log.log(`Generated INV-${invoice.invoiceNumber} from rule ${rule.id}`);

      // SEND_DIRECTLY → through the manual-send pipeline (sync attempt + queued retries + notifications).
      if (rule.sendingOption === 'SEND_DIRECTLY') {
        await this.invoiceMail.send(invoice.id).catch((e) => {
          // InvoiceMailService.send shouldn't throw — it returns a status — but be defensive.
          this.log.warn(`SEND_DIRECTLY send threw for INV-${invoice.invoiceNumber}: ${(e as Error).message}`);
        });
      }

      // Advance nextRunAt regardless of send outcome.
      const next = advanceNextRun(
        rule.nextRunAt,
        rule.recurringSchedule.intervalUnit,
        rule.recurringSchedule.intervalCount,
      );
      await this.prisma.recurringRule.update({
        where: { id: rule.id },
        data: { nextRunAt: next },
      });
    }
  }
}
