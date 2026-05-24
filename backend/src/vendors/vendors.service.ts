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

  create(dto: CreateVendorDto) {
    // Treat empty string as "no link". UUID sets it. Undefined leaves it unset.
    const customerId =
      dto.customerId === undefined ? undefined : dto.customerId === '' ? null : dto.customerId;
    return this.prisma.vendor.create({
      data: {
        ...dto,
        isActive: dto.isActive ?? true,
        aliases: dto.aliases.map((a) => a.toLowerCase()),
        customerId,
      },
    });
  }

  async update(id: string, dto: UpdateVendorDto) {
    await this.get(id);
    const data: any = {
      ...dto,
      aliases: dto.aliases ? dto.aliases.map((a) => a.toLowerCase()) : undefined,
    };
    // Treat empty string as "clear the link". UUID sets it. Undefined leaves it untouched.
    if (dto.customerId !== undefined) {
      data.customerId = dto.customerId === '' ? null : dto.customerId;
    }
    return this.prisma.vendor.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.vendor.delete({ where: { id } });
    return { ok: true };
  }
}
