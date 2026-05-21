import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxTypeDto, UpdateTaxTypeDto } from './dto';

@Injectable()
export class TaxTypesService {
  constructor(private prisma: PrismaService) {}

  // Active rows first, then name ASC.
  list() {
    return this.prisma.taxType.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async get(id: string) {
    const row = await this.prisma.taxType.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  create(data: CreateTaxTypeDto) {
    return this.prisma.taxType.create({
      data: { ...data, isActive: data.isActive ?? true },
    });
  }

  async update(id: string, data: UpdateTaxTypeDto) {
    await this.get(id);
    return this.prisma.taxType.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.taxType.delete({ where: { id } });
    return { ok: true };
  }
}
