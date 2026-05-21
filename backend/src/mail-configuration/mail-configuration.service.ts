import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertMailConfigurationDto } from './dto';

@Injectable()
export class MailConfigurationService {
  constructor(private prisma: PrismaService) {}

  // Singleton: at most one row.
  async get() {
    const existing = await this.prisma.mailConfiguration.findFirst();
    if (existing) return existing;
    // Lazily create the single row on first read so the form has a stable shape.
    return this.prisma.mailConfiguration.create({ data: {} });
  }

  async save(data: UpsertMailConfigurationDto) {
    const existing = await this.prisma.mailConfiguration.findFirst();
    if (existing) {
      return this.prisma.mailConfiguration.update({ where: { id: existing.id }, data });
    }
    return this.prisma.mailConfiguration.create({ data });
  }
}
