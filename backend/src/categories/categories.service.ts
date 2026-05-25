import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  // Sibling-scoped case-insensitive uniqueness. parentId=null is the top-level
  // namespace; rows with the same parentId share a namespace.
  private async assertNameAvailable(name: string, parentId: string | null, excludeId?: string) {
    const trimmed = name.trim();
    const clash = await this.prisma.category.findFirst({
      where: {
        name: { equals: trimmed, mode: 'insensitive' },
        parentId: parentId ?? null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new BadRequestException(
        `A category named "${clash.name}" already exists under the same parent. Category names must be unique among siblings.`,
      );
    }
  }

  private async assertParentValid(parentId: string | null, childKind: string) {
    if (parentId === null) return;
    const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new BadRequestException('Parent category not found.');
    if (parent.parentId !== null) {
      throw new BadRequestException('Subcategories cannot themselves have subcategories (one-level cap).');
    }
    if (parent.kind !== childKind) {
      throw new BadRequestException(`Subcategory kind (${childKind}) must match parent kind (${parent.kind}).`);
    }
  }

  async list() {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { transactions: true, transactionSplits: true, rules: true, children: true } },
      },
    });
    return rows;
  }

  async get(id: string) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  async create(data: CreateCategoryDto) {
    const parentId = data.parentId ?? null;
    await this.assertParentValid(parentId, data.kind);
    await this.assertNameAvailable(data.name, parentId);
    return this.prisma.category.create({
      data: {
        name: data.name.trim(),
        kind: data.kind,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 100,
        parentId,
      },
    });
  }

  async update(id: string, data: UpdateCategoryDto) {
    const existing = await this.get(id);
    const nextParentId = data.parentId === undefined ? existing.parentId : (data.parentId ?? null);
    const nextKind = data.kind ?? existing.kind;
    const nextName = (data.name ?? existing.name).trim();

    if (nextParentId !== existing.parentId || data.kind !== undefined) {
      await this.assertParentValid(nextParentId, nextKind);
    }
    if (data.name !== undefined || data.parentId !== undefined) {
      await this.assertNameAvailable(nextName, nextParentId, id);
    }
    if (data.parentId !== undefined && data.parentId !== existing.parentId) {
      const childCount = await this.prisma.category.count({ where: { parentId: id } });
      if (childCount > 0) {
        throw new BadRequestException('Cannot reparent a category that has subcategories. Move or delete its children first.');
      }
    }
    if (data.kind !== undefined && data.kind !== existing.kind) {
      const childCountForKindChange = await this.prisma.category.count({ where: { parentId: id } });
      if (childCountForKindChange > 0) {
        throw new BadRequestException('Cannot change the kind of a category that has subcategories. Move or delete its children first.');
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: nextName } : {}),
        ...(data.kind !== undefined ? { kind: nextKind } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.parentId !== undefined ? { parentId: nextParentId } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    const childCount = await this.prisma.category.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new ConflictException(`Cannot delete: ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'} still attached. Delete or reparent them first.`);
    }
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

  async split(id: string): Promise<{ alreadyGroup: boolean; child: any; migratedCount: number }> {
    const parent = await this.get(id);
    const existingChildren = await this.prisma.category.count({ where: { parentId: id } });
    if (existingChildren > 0) {
      return { alreadyGroup: true, child: null as any, migratedCount: 0 };
    }
    if (parent.parentId !== null) {
      throw new BadRequestException('Cannot split a subcategory — subcategories cannot have children.');
    }
    const childName = `${parent.name} (general)`;
    await this.assertNameAvailable(childName, id);

    return this.prisma.$transaction(async (tx) => {
      const child = await tx.category.create({
        data: {
          name: childName,
          kind: parent.kind,
          isActive: parent.isActive,
          sortOrder: 100,
          parentId: id,
        },
      });
      const migrate = await tx.transaction.updateMany({
        where: { categoryId: id },
        data: { categoryId: child.id },
      });
      return { alreadyGroup: false, child, migratedCount: migrate.count };
    });
  }
}
