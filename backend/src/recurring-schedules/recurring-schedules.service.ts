import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecurringScheduleDto, UpdateRecurringScheduleDto } from './dto';

@Injectable()
export class RecurringSchedulesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.recurringSchedule.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const row = await this.prisma.recurringSchedule.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  create(data: CreateRecurringScheduleDto) {
    return this.prisma.recurringSchedule.create({
      data: { ...data, isActive: data.isActive ?? true },
    });
  }

  async update(id: string, data: UpdateRecurringScheduleDto) {
    await this.get(id);
    return this.prisma.recurringSchedule.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.recurringSchedule.delete({ where: { id } });
    return { ok: true };
  }
}
