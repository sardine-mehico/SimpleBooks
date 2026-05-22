import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { transactions: true, transactionSplits: true, rules: true } } },
    });
    return rows;
  }

  async get(id: string) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  create(data: CreateCategoryDto) {
    return this.prisma.category.create({
      data: { ...data, isActive: data.isActive ?? true, sortOrder: data.sortOrder ?? 100 },
    });
  }

  async update(id: string, data: UpdateCategoryDto) {
    await this.get(id);
    return this.prisma.category.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    const [txCount, splitCount, ruleCount] = await Promise.all([
      this.prisma.transaction.count({ where: { categoryId: id } }),
      this.prisma.transactionSplit.count({ where: { categoryId: id } }),
      this.prisma.rule.count({ where: { categoryId: id } }),
    ]);
    if (txCount + splitCount + ruleCount > 0) {
      const parts: string[] = [];
      if (txCount) parts.push(`${txCount} transaction${txCount === 1 ? '' : 's'}`);
      if (splitCount) parts.push(`${splitCount} split${splitCount === 1 ? '' : 's'}`);
      if (ruleCount) parts.push(`${ruleCount} rule${ruleCount === 1 ? '' : 's'}`);
      throw new ConflictException(`Cannot delete category: ${parts.join(', ')} reference it. Reassign first.`);
    }
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }
}
