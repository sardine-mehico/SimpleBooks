import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Read-only. The catalogue is seeded and immutable in normal operation — see
// `prisma/seed.ts` and the rotation logic in `companies.service.ts`. Writes
// happen via seed-time scripts only; no runtime UI mutates this table.
@Injectable()
export class EmailTemplatesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.emailTemplate.findMany({ orderBy: { displayOrder: 'asc' } });
  }

  async get(id: string) {
    const row = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }
}
