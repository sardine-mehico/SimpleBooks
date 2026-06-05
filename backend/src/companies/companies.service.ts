import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto';
import { assertIfMatch } from '../common/etag';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.billingCompany.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const row = await this.prisma.billingCompany.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  // Atomically assign a creationOrder (1-based) and the matching template
  // pair via the rotation rule: displayOrder = ((creationOrder - 1) % N) + 1,
  // where N is the count of templates of that type. Templates are FK
  // `Restrict` so an in-use template cannot be deleted out from under us.
  async create(data: CreateCompanyDto) {
    return this.prisma.$transaction(async (tx) => {
      const agg = await tx.billingCompany.aggregate({ _max: { creationOrder: true } });
      const creationOrder = (agg._max.creationOrder ?? 0) + 1;

      const [invoiceCount, emailCount] = await Promise.all([
        tx.invoiceTemplate.count(),
        tx.emailTemplate.count(),
      ]);

      const invoiceDisplayOrder = invoiceCount > 0 ? ((creationOrder - 1) % invoiceCount) + 1 : null;
      const emailDisplayOrder = emailCount > 0 ? ((creationOrder - 1) % emailCount) + 1 : null;

      const [invoiceTemplate, emailTemplate] = await Promise.all([
        invoiceDisplayOrder != null
          ? tx.invoiceTemplate.findUnique({ where: { displayOrder: invoiceDisplayOrder } })
          : Promise.resolve(null),
        emailDisplayOrder != null
          ? tx.emailTemplate.findUnique({ where: { displayOrder: emailDisplayOrder } })
          : Promise.resolve(null),
      ]);

      return tx.billingCompany.create({
        data: {
          ...data,
          isActive: data.isActive ?? true,
          creationOrder,
          invoiceTemplateId: invoiceTemplate?.id ?? null,
          emailTemplateId: emailTemplate?.id ?? null,
        },
      });
    });
  }

  async update(id: string, data: UpdateCompanyDto, ifMatch?: string) {
    const existing = await this.get(id);
    assertIfMatch(existing.updatedAt, ifMatch);
    const patch: Record<string, unknown> = { ...data };
    // Auto-stamp deactivatedAt when isActive transitions true → false.
    // Clear it when re-activating.
    if (data.isActive !== undefined && data.isActive !== existing.isActive) {
      patch.deactivatedAt = data.isActive ? null : new Date();
    }
    return this.prisma.billingCompany.update({ where: { id }, data: patch });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.billingCompany.delete({ where: { id } });
    return { ok: true };
  }
}
