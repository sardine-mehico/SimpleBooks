import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAiProviderDto, MoveAiProviderDto, UpdateAiProviderDto } from './dto';

@Injectable()
export class AiProvidersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.aiProvider.findMany({
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async get(id: string) {
    const row = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  async create(data: CreateAiProviderDto) {
    // First provider auto-becomes primary; subsequent ones default to backup.
    const existingCount = await this.prisma.aiProvider.count();
    const makePrimary = data.isPrimary === true || existingCount === 0;
    return this.prisma.$transaction(async (tx) => {
      if (makePrimary) {
        await tx.aiProvider.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } });
      }
      return tx.aiProvider.create({
        data: { ...data, isPrimary: makePrimary },
      });
    });
  }

  async update(id: string, data: UpdateAiProviderDto) {
    await this.get(id);
    return this.prisma.aiProvider.update({ where: { id }, data });
  }

  async setPrimary(id: string) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.aiProvider.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } });
      return tx.aiProvider.update({ where: { id }, data: { isPrimary: true } });
    });
  }

  async move(id: string, direction: 'up' | 'down') {
    const target = await this.get(id);
    if (target.isPrimary) {
      // Primary is always position 1; movement is via setPrimary.
      return target;
    }
    const all = await this.prisma.aiProvider.findMany({
      where: { isPrimary: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const idx = all.findIndex((p) => p.id === id);
    const neighbourIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (neighbourIdx < 0 || neighbourIdx >= all.length) return target;
    const neighbour = all[neighbourIdx];
    return this.prisma.$transaction(async (tx) => {
      // Swap sortOrders. If equal, bump the neighbour by 10 then assign.
      let aOrder = target.sortOrder;
      let bOrder = neighbour.sortOrder;
      if (aOrder === bOrder) bOrder = aOrder + 10;
      await tx.aiProvider.update({ where: { id: target.id }, data: { sortOrder: bOrder } });
      await tx.aiProvider.update({ where: { id: neighbour.id }, data: { sortOrder: aOrder } });
      return tx.aiProvider.findUnique({ where: { id: target.id } });
    });
  }

  async remove(id: string) {
    const row = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.aiProvider.delete({ where: { id } });
      // If we deleted the primary, promote the oldest remaining one.
      if (row.isPrimary) {
        const next = await tx.aiProvider.findFirst({ orderBy: { createdAt: 'asc' } });
        if (next) await tx.aiProvider.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      return { ok: true };
    });
  }
}
