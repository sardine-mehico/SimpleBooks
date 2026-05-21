import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Read-only. See note in `email-templates.service.ts`.
@Injectable()
export class InvoiceTemplatesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.invoiceTemplate.findMany({ orderBy: { displayOrder: 'asc' } });
  }

  async get(id: string) {
    const row = await this.prisma.invoiceTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }
}
