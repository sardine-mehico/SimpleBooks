import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.task.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException();
    return task;
  }

  create(data: CreateTaskDto) {
    const status = data.status ?? TaskStatus.PENDING;
    return this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        status,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        startedAt: status === TaskStatus.IN_PROGRESS ? new Date() : null,
        completedAt: status === TaskStatus.COMPLETED ? new Date() : null,
        cancelledAt: status === TaskStatus.CANCELLED ? new Date() : null,
      },
    });
  }

  async update(id: string, data: UpdateTaskDto) {
    const existing = await this.get(id);
    const patch: Prisma.TaskUpdateInput = {
      title: data.title,
      description: data.description,
      status: data.status,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    };
    if (data.status && data.status !== existing.status) {
      // Stamp the audit field for the newly entered status the first time we land on it.
      if (data.status === TaskStatus.IN_PROGRESS && !existing.startedAt) patch.startedAt = new Date();
      if (data.status === TaskStatus.COMPLETED && !existing.completedAt) patch.completedAt = new Date();
      if (data.status === TaskStatus.CANCELLED && !existing.cancelledAt) patch.cancelledAt = new Date();
    }
    return this.prisma.task.update({ where: { id }, data: patch });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.task.delete({ where: { id } });
    return { ok: true };
  }
}
