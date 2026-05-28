import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { localStartOfDay, localEndOfDay } from '../util/dates';
import type { StatementResponse, StatementRow } from './types';

type GetParams = {
  customerId: string;
  billingCompanyId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
};

@Injectable()
export class StatementsService {
  constructor(private prisma: PrismaService) {}

  async getStatement(params: GetParams): Promise<StatementResponse> {
    const { customerId, billingCompanyId } = params;
    const dateFrom = params.dateFrom ?? null;
    const dateTo = params.dateTo ?? null;

    const [customer, billingCompany, prefs] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.billingCompany.findUnique({ where: { id: billingCompanyId } }),
      this.prisma.preferences.findFirst(),
    ]);
    if (!customer) throw new NotFoundException('Customer not found');
    if (!billingCompany) throw new NotFoundException('Billing company not found');
    const tz = prefs?.timezone ?? 'Australia/Perth';

    const fromInstant = dateFrom ? localStartOfDay(dateFrom, tz) : null;
    const toInstant = dateTo ? localEndOfDay(dateTo, tz) : null;

    const openingBalance = await this.computeOpeningBalance({
      customerId, billingCompanyId, fromInstant,
    });

    // Body rows + running balance — Task 3 wires this up.
    const rows: StatementRow[] = [];
    const invoicedAmount = new Decimal('0');
    const amountReceived = new Decimal('0');
    const balanceDue = openingBalance.add(invoicedAmount).sub(amountReceived);

    return {
      customer: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        address: customer.address ?? null,
        billingEmail1: customer.billingEmail1 ?? null,
        billingEmail2: customer.billingEmail2 ?? null,
      },
      billingCompany: {
        id: billingCompany.id,
        name: billingCompany.name,
        abn: billingCompany.abn ?? null,
        address: billingCompany.address ?? null,
        accountsEmail: billingCompany.accountsEmail ?? null,
        invoiceBcc: billingCompany.invoiceBcc ?? '',
        paymentDetails: billingCompany.paymentDetails ?? null,
      },
      dateFrom,
      dateTo,
      openingBalance: openingBalance.toFixed(2),
      rows,
      summary: {
        invoicedAmount: invoicedAmount.toFixed(2),
        amountReceived: amountReceived.toFixed(2),
        balanceDue: balanceDue.toFixed(2),
      },
    };
  }

  private async computeOpeningBalance(params: {
    customerId: string;
    billingCompanyId: string;
    fromInstant: Date | null;
  }): Promise<Decimal> {
    if (!params.fromInstant) return new Decimal('0');

    const preInvoices = await this.prisma.invoice.findMany({
      where: {
        customerId: params.customerId,
        billingCompanyId: params.billingCompanyId,
        status: { not: 'VOID' as any },
        invoiceDate: { lt: params.fromInstant },
      },
    });
    const invoicedPre = preInvoices.reduce(
      (acc: Decimal, inv: any) => acc.add(new Decimal(inv.totalAmount.toString())),
      new Decimal('0'),
    );

    const preAllocs = await this.prisma.allocation.findMany({
      where: {
        invoice: {
          customerId: params.customerId,
          billingCompanyId: params.billingCompanyId,
          status: { not: 'VOID' as any },
        },
        transaction: { date: { lt: params.fromInstant } },
      },
    });
    const paidPre = preAllocs.reduce(
      (acc: Decimal, a: any) => acc.add(new Decimal(a.amount.toString())),
      new Decimal('0'),
    );

    return invoicedPre.sub(paidPre);
  }
}
