import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategorisationEventsService {
  constructor(private prisma: PrismaService) {}

  list(q: { transactionId?: string; source?: string; limit?: number }) {
    const where: any = {};
    if (q.transactionId) where.transactionId = q.transactionId;
    if (q.source) where.source = q.source;
    return this.prisma.categorisationEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 200,
      include: {
        rule: { select: { id: true, name: true } },
      },
    });
  }
}
