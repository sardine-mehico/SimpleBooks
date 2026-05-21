import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListTransactionsDto } from './dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async list(q: ListTransactionsDto) {
    const where: Prisma.TransactionWhereInput = {};
    if (q.accountIds && q.accountIds.length > 0) {
      where.accountId = { in: q.accountIds };
    }
    if (q.dateFrom || q.dateTo) {
      where.date = {};
      if (q.dateFrom) (where.date as Prisma.DateTimeFilter).gte = new Date(q.dateFrom);
      if (q.dateTo) (where.date as Prisma.DateTimeFilter).lte = new Date(q.dateTo);
    }

    const sortBy = q.sortBy ?? 'date';
    const sortDir = q.sortDir ?? 'desc';
    const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [
      { [sortBy]: sortDir } as Prisma.TransactionOrderByWithRelationInput,
    ];
    // Stable secondary sort on id desc so same-date rows always come back in
    // the same order (paginating across same-day rows would otherwise jitter).
    if (sortBy !== 'date') orderBy.push({ id: 'desc' });
    else orderBy.push({ id: 'desc' });

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 200;
    const skip = (page - 1) * pageSize;

    const [items, totalCount] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: { account: { select: { id: true, name: true } } },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { items, totalCount, page, pageSize };
  }
}
