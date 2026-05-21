import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary() {
    const [invoices, pendingTasks, recentInvoices] = await Promise.all([
      this.prisma.invoice.findMany(),
      this.prisma.task.findMany({
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.invoice.findMany({
        orderBy: { invoiceDate: 'desc' },
        take: 4,
        include: { customer: true },
      }),
    ]);

    const sum = (predicate: (i: (typeof invoices)[number]) => boolean) =>
      invoices.filter(predicate).reduce((acc, i) => acc + Number(i.totalAmount), 0);

    const totalRevenue = sum((i) => i.status === 'PAID');
    const receivable = sum((i) => i.status === 'SENT' || i.status === 'VIEWED' || i.status === 'PARTIAL_PAID');
    const netIncome = totalRevenue * 0.22;
    const cashFlow = totalRevenue - receivable * 0.1;

    const year = new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, m) => {
      const monthInvoices = invoices.filter((i) => {
        const d = new Date(i.invoiceDate);
        return d.getFullYear() === year && d.getMonth() === m;
      });
      const revenue = monthInvoices
        .filter((i) => i.status === 'PAID')
        .reduce((a, i) => a + Number(i.totalAmount), 0);
      const expense = revenue * 0.6;
      return { month: m, revenue, expense };
    });

    return {
      totals: { totalRevenue, cashFlow, netIncome, receivable },
      monthly: months,
      pendingTasks,
      recentInvoices,
    };
  }
}
