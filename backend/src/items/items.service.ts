import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto, UpdateItemDto } from './dto';

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.item.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const row = await this.prisma.item.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  create(data: CreateItemDto) {
    return this.prisma.item.create({ data: { ...data, isActive: data.isActive ?? true } });
  }

  async update(id: string, data: UpdateItemDto) {
    await this.get(id);
    return this.prisma.item.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.item.delete({ where: { id } });
    return { ok: true };
  }
}
