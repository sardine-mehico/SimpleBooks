import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.customer.findMany({
      orderBy: { customerNumber: 'asc' },
      include: { billingCompany: true },
    });
  }

  async get(id: string) {
    const row = await this.prisma.customer.findUnique({
      where: { id },
      include: { billingCompany: true },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async nextNumber() {
    const top = await this.prisma.customer.findFirst({ orderBy: { customerNumber: 'desc' } });
    return (top?.customerNumber ?? 1000) + 1;
  }

  async create(data: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        name: data.name,
        billingEmail1: data.billingEmail1,
        billingEmail2: data.billingEmail2,
        billingCompanyId: data.billingCompanyId,
        paymentTerms: data.paymentTerms,
        address: data.address,
        notes: data.notes,
        isActive: data.isActive ?? true,
        customerNumber: await this.nextNumber(),
      },
    });
  }

  async update(id: string, data: UpdateCustomerDto) {
    await this.get(id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        billingEmail1: data.billingEmail1,
        billingEmail2: data.billingEmail2,
        billingCompanyId: data.billingCompanyId === '' ? null : data.billingCompanyId,
        paymentTerms: data.paymentTerms,
        address: data.address,
        notes: data.notes,
        isActive: data.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    // Reject deletion when any invoice or recurring rule still references
    // this customer. Stops accidental orphaning of financial history and
    // breakage of scheduled generation. The user has to detach / delete those
    // first.
    const [invoiceCount, recurringCount] = await Promise.all([
      this.prisma.invoice.count({ where: { customerId: id } }),
      this.prisma.recurringRule.count({ where: { customerId: id } }),
    ]);
    if (invoiceCount > 0 || recurringCount > 0) {
      const parts: string[] = [];
      if (invoiceCount > 0) parts.push(`${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`);
      if (recurringCount > 0) parts.push(`${recurringCount} recurring invoice${recurringCount === 1 ? '' : 's'}`);
      throw new ConflictException(
        `Cannot delete customer: ${parts.join(' and ')} reference this customer. Remove or reassign them first.`,
      );
    }
    await this.prisma.customer.delete({ where: { id } });
    return { ok: true };
  }
}
