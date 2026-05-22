import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto, UpdateVendorDto } from './dto';

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}

  async list(includeInactive = false) {
    return this.prisma.vendor.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { transactions: true } } },
    });
  }

  async get(id: string) {
    const row = await this.prisma.vendor.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  create(data: CreateVendorDto) {
    return this.prisma.vendor.create({
      data: {
        ...data,
        isActive: data.isActive ?? true,
        aliases: data.aliases.map((a) => a.toLowerCase()),
      },
    });
  }

  async update(id: string, data: UpdateVendorDto) {
    await this.get(id);
    return this.prisma.vendor.update({
      where: { id },
      data: {
        ...data,
        aliases: data.aliases ? data.aliases.map((a) => a.toLowerCase()) : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.vendor.delete({ where: { id } });
    return { ok: true };
  }
}
