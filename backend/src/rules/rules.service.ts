import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRuleDto, RuleStateDto, UpdateRuleDto } from './dto';

const PRIORITY_GAP = 10;

@Injectable()
export class RulesService {
  constructor(private prisma: PrismaService) {}

  async list(filter: { state?: RuleStateDto[]; isActive?: boolean } = {}) {
    const where: Prisma.RuleWhereInput = {};
    if (filter.state?.length) where.state = { in: filter.state as any };
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    return this.prisma.rule.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: {
        conditions: { orderBy: { position: 'asc' } },
        category: { select: { id: true, name: true, kind: true } },
        vendor: { select: { id: true, name: true } },
      },
    });
  }

  async get(id: string) {
    const row = await this.prisma.rule.findUnique({
      where: { id },
      include: {
        conditions: { orderBy: { position: 'asc' } },
        category: { select: { id: true, name: true, kind: true } },
        vendor: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  async create(data: CreateRuleDto) {
    const maxPriority = (await this.prisma.rule.aggregate({ _max: { priority: true } }))._max.priority ?? (1000 - PRIORITY_GAP);
    return this.prisma.rule.create({
      data: {
        name: data.name,
        categoryId: data.categoryId,
        vendorId: data.vendorId,
        noteOnApply: data.noteOnApply,
        isActive: data.isActive ?? true,
        priority: maxPriority + PRIORITY_GAP,
        conditions: {
          create: data.conditions.map((c, i) => ({
            field: c.field as any,
            operator: c.operator as any,
            value: c.value,
            value2: c.value2,
            valueList: c.valueList ?? [],
            position: i,
          })),
        },
      },
      include: { conditions: true },
    });
  }

  async update(id: string, data: UpdateRuleDto) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      if (data.conditions) {
        await tx.ruleCondition.deleteMany({ where: { ruleId: id } });
      }
      return tx.rule.update({
        where: { id },
        data: {
          name: data.name,
          categoryId: data.categoryId,
          vendorId: data.vendorId,
          noteOnApply: data.noteOnApply,
          isActive: data.isActive,
          conditions: data.conditions
            ? {
                create: data.conditions.map((c, i) => ({
                  field: c.field as any,
                  operator: c.operator as any,
                  value: c.value,
                  value2: c.value2,
                  valueList: c.valueList ?? [],
                  position: i,
                })),
              }
            : undefined,
        },
        include: { conditions: true },
      });
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.rule.delete({ where: { id } });
    return { ok: true };
  }

  async move(id: string, direction: 'up' | 'down') {
    const target = await this.get(id);
    const neighbour = await this.prisma.rule.findFirst({
      where: direction === 'up'
        ? { priority: { lt: target.priority } }
        : { priority: { gt: target.priority } },
      orderBy: direction === 'up' ? { priority: 'desc' } : { priority: 'asc' },
    });
    if (!neighbour) return target;
    await this.prisma.$transaction([
      this.prisma.rule.update({ where: { id: target.id }, data: { priority: neighbour.priority } }),
      this.prisma.rule.update({ where: { id: neighbour.id }, data: { priority: target.priority } }),
    ]);
    return this.get(id);
  }

  async setState(id: string, state: RuleStateDto) {
    await this.get(id);
    return this.prisma.rule.update({ where: { id }, data: { state: state as any } });
  }

  async toggleActive(id: string, isActive: boolean) {
    await this.get(id);
    return this.prisma.rule.update({ where: { id }, data: { isActive } });
  }
}
