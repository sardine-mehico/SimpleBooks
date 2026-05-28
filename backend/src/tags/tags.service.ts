import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto, UpdateTagDto } from './dto';
import { AutoAliasTag, buildMatchIndex, findMatchingTagIds } from './auto-alias';

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.tag.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { _count: { select: { transactionTags: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async get(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: { _count: { select: { transactionTags: true } } },
    });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  async create(dto: CreateTagDto) {
    const trimmed = dto.name.trim();
    const clash = await this.prisma.tag.findFirst({ where: { name: { equals: trimmed, mode: 'insensitive' } } });
    if (clash) throw new BadRequestException(`Tag "${trimmed}" already exists`);
    return this.prisma.tag.create({
      data: {
        name: trimmed,
        aliases: this.cleanAliases(dto.aliases ?? []),
        color: dto.color ?? null,
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
        customerId: dto.customerId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateTagDto) {
    const existing = await this.prisma.tag.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tag not found');
    if (dto.name && dto.name.trim() !== existing.name) {
      const trimmed = dto.name.trim();
      const clash = await this.prisma.tag.findFirst({
        where: { name: { equals: trimmed, mode: 'insensitive' }, NOT: { id } },
      });
      if (clash) throw new BadRequestException(`Tag "${trimmed}" already exists`);
    }
    return this.prisma.tag.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.aliases !== undefined && { aliases: this.cleanAliases(dto.aliases) }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.customerId !== undefined && { customerId: dto.customerId }),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.tag.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tag not found');
    await this.prisma.tag.delete({ where: { id } });
    return { ok: true };
  }

  // Apply (or replace) tags on a transaction. `source` = USER for manual edits.
  async setTransactionTags(transactionId: string, tagIds: string[], source: 'USER' | 'RULE' | 'AI_APPLIED' | 'AUTO_ALIAS' = 'USER') {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    const unique = Array.from(new Set(tagIds));
    if (unique.length > 0) {
      const found = await this.prisma.tag.findMany({ where: { id: { in: unique } }, select: { id: true } });
      if (found.length !== unique.length) throw new BadRequestException('One or more tagIds are unknown');
    }
    await this.prisma.$transaction([
      this.prisma.transactionTag.deleteMany({ where: { transactionId } }),
      ...(unique.length > 0
        ? [this.prisma.transactionTag.createMany({
            data: unique.map((tagId) => ({ transactionId, tagId, source })),
            skipDuplicates: true,
          })]
        : []),
    ]);
    return { ok: true, count: unique.length };
  }

  // Add tags without clobbering existing ones. Used by auto-alias pass and
  // future rule-engine integration.
  async addTransactionTags(transactionId: string, tagIds: string[], source: 'USER' | 'RULE' | 'AI_APPLIED' | 'AUTO_ALIAS') {
    const unique = Array.from(new Set(tagIds));
    if (unique.length === 0) return { added: 0 };
    const result = await this.prisma.transactionTag.createMany({
      data: unique.map((tagId) => ({ transactionId, tagId, source })),
      skipDuplicates: true,
    });
    return { added: result.count };
  }

  // Auto-alias pass over a set of transactions (or all). Reads active tags,
  // builds the match index once, scans each transaction's description, and
  // inserts TransactionTag rows for matches. Idempotent — existing
  // (transactionId, tagId) pairs are skipped.
  async autoAliasApply(opts: { transactionIds?: string[]; onlyTagId?: string } = {}) {
    const tags = await this.prisma.tag.findMany({
      where: { isActive: true, ...(opts.onlyTagId && { id: opts.onlyTagId }) },
      select: { id: true, name: true, aliases: true },
    });
    if (tags.length === 0) return { scanned: 0, applied: 0 };
    const index = buildMatchIndex(tags as AutoAliasTag[]);

    const txns = await this.prisma.transaction.findMany({
      where: opts.transactionIds ? { id: { in: opts.transactionIds } } : {},
      select: { id: true, description: true },
    });
    if (txns.length === 0) return { scanned: 0, applied: 0 };

    let applied = 0;
    // Batch in chunks of 500 for sanity on large datasets.
    const chunkSize = 500;
    for (let i = 0; i < txns.length; i += chunkSize) {
      const chunk = txns.slice(i, i + chunkSize);
      const rows: Array<{ transactionId: string; tagId: string; source: 'AUTO_ALIAS' }> = [];
      for (const tx of chunk) {
        const matched = findMatchingTagIds(tx.description, index);
        for (const tagId of matched) rows.push({ transactionId: tx.id, tagId, source: 'AUTO_ALIAS' });
      }
      if (rows.length > 0) {
        const result = await this.prisma.transactionTag.createMany({ data: rows, skipDuplicates: true });
        applied += result.count;
      }
    }
    return { scanned: txns.length, applied };
  }

  private cleanAliases(aliases: string[]): string[] {
    const cleaned = aliases.map((a) => a.trim()).filter((a) => a.length > 0);
    return Array.from(new Set(cleaned.map((a) => a))); // de-dup case-sensitive (user may want both "CRV" and "crv"? probably not, but safe)
  }
}
