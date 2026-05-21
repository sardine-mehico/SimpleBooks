import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImportLogsService {
  constructor(private prisma: PrismaService) {}

  async list(q: { accountId?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }) {
    const where: any = {};
    if (q.accountId) where.accountId = q.accountId;
    if (q.dateFrom || q.dateTo) {
      where.importedAt = {};
      if (q.dateFrom) where.importedAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.importedAt.lte = new Date(q.dateTo);
    }
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 100;
    const [items, totalCount] = await Promise.all([
      this.prisma.transactionImport.findMany({
        where,
        orderBy: { importedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          accountId: true,
          filename: true,
          fileSize: true,
          importedAt: true,
          rowsTotal: true,
          rowsImported: true,
          rowsSkippedDup: true,
          rowsFailed: true,
          account: { select: { id: true, name: true } },
        },
      }),
      this.prisma.transactionImport.count({ where }),
    ]);
    return { items, totalCount, page, pageSize };
  }

  async get(id: string) {
    const row = await this.prisma.transactionImport.findUnique({
      where: { id },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException();
    return row;
  }
}
