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

  // Returns the configured default Terms text (or null if unset). Read by
  // InvoicesService.create + RecurringService.create at the start of a fresh
  // entity flow to pre-populate the `terms` field when the caller didn't
  // override it.
  async getDefaultInvoiceTerms(): Promise<string | null> {
    const p = await this.get();
    return p.defaultInvoiceTerms ?? null;
  }

  // Narrow setter for the Terms-specific endpoint — separate from `save()`
  // so the controller can guard with `settings.terms` without exposing the
  // whole upsert surface to that capability.
  async setDefaultInvoiceTerms(text: string | null) {
    const existing = await this.prisma.preferences.findFirst();
    if (existing) {
      return this.prisma.preferences.update({
        where: { id: existing.id },
        data: { defaultInvoiceTerms: text },
      });
    }
    return this.prisma.preferences.create({
      data: { defaultInvoiceTerms: text },
    });
  }
}
