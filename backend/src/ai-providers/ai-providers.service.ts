import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAiProviderDto, UpdateAiProviderDto } from './dto';

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
