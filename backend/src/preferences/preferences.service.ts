import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPreferencesDto } from './dto';

@Injectable()
export class PreferencesService {
  constructor(private prisma: PrismaService) {}

  // Singleton — lazily created on first read.
  async get() {
    const existing = await this.prisma.preferences.findFirst();
    if (existing) return existing;
    return this.prisma.preferences.create({ data: {} });
  }

  async save(data: UpsertPreferencesDto) {
    const existing = await this.prisma.preferences.findFirst();
    if (existing) {
      return this.prisma.preferences.update({ where: { id: existing.id }, data });
    }
    return this.prisma.preferences.create({ data });
  }

  // Convenience for non-HTTP callers (e.g. RecurringService at module init).
  async getTimezone(): Promise<string> {
    const p = await this.get();
    return p.timezone || 'UTC';
  }
}
