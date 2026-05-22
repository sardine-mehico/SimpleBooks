import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseCsv } from '../transaction-imports/csv-parser.service';
import { sniffCsv } from '../transaction-imports/csv-sniffer.service';

const NOISE_PREFIXES = [
  'direct debit ', 'direct credit ',
  'fast transfer from ', 'fast transfer to ',
  'transfer to other bank ', 'transfer to ', 'transfer from ',
  'commbank app ', 'netbank ',
];

const STOP_TOKENS = new Set(['ltd', 'pty', 'limited', 'pl', 'co', 'inc', 'corp', 'au', 'aus']);

export interface VendorCandidate {
  suggestedName: string;
  aliases: string[];
  matchCount: number;
  sampleDescriptions: string[];
  existsAs: string | null;
  suggestedKind: 'MERCHANT' | 'PERSON' | 'CUSTOMER' | 'BANK' | 'OTHER';
}

export function normaliseAndTokenise(description: string): string[] {
  let s = description.toLowerCase().trim();
  for (const p of NOISE_PREFIXES) {
    if (s.startsWith(p)) { s = s.slice(p.length); break; }
  }
  s = s.replace(/\s+\d{6,}$/g, '');
  s = s.replace(/^\d{4,}\s+/, '');
  s = s.replace(/\s+/g, ' ').trim();
  const tokens = s.split(' ').filter((t) => {
    if (t.length < 3 && !['bp', 'ww', 'an'].includes(t)) return false;
    if (STOP_TOKENS.has(t)) return false;
    if (/^\d+$/.test(t)) return false;
    return true;
  });
  return tokens;
}

function prettify(s: string): string {
  return s.split(' ').map((w) => w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function extractCandidates(
  descriptions: string[],
  existingAliases: Map<string, string>,
  amounts?: number[],
): VendorCandidate[] {
  const perDesc = descriptions.map((d) => normaliseAndTokenise(d));

  const ngramToIndices = new Map<string, Set<number>>();
  perDesc.forEach((tokens, idx) => {
    for (let i = 0; i < tokens.length; i++) {
      const uni = tokens[i];
      if (!ngramToIndices.has(uni)) ngramToIndices.set(uni, new Set());
      ngramToIndices.get(uni)!.add(idx);
      if (i + 1 < tokens.length) {
        const bi = tokens[i] + ' ' + tokens[i + 1];
        if (!ngramToIndices.has(bi)) ngramToIndices.set(bi, new Set());
        ngramToIndices.get(bi)!.add(idx);
      }
    }
  });

  const significant = Array.from(ngramToIndices.entries())
    .filter(([_, indices]) => indices.size >= 3)
    .sort((a, b) => b[1].size - a[1].size);

  const chosen: Array<{ ngram: string; indices: Set<number> }> = [];
  const consumedIndices = new Set<number>();
  for (const [ngram, indices] of significant) {
    const fresh = Array.from(indices).filter((i) => !consumedIndices.has(i));
    if (fresh.length < 2) continue;
    chosen.push({ ngram, indices });
    for (const i of indices) consumedIndices.add(i);
    if (chosen.length >= 100) break;
  }

  return chosen.map(({ ngram, indices }) => {
    const aliasNormalised = ngram;
    const existsAs = existingAliases.get(aliasNormalised) ?? null;
    const sampleIndices = Array.from(indices).slice(0, 3);
    const sampleDescriptions = sampleIndices.map((i) => descriptions[i]);

    let suggestedKind: VendorCandidate['suggestedKind'] = 'MERCHANT';
    if (amounts) {
      const subset = Array.from(indices).map((i) => amounts[i]);
      const positiveCount = subset.filter((a) => a > 0).length;
      if (positiveCount > subset.length / 2) {
        suggestedKind = 'CUSTOMER';
      } else if (subset.every((a) => a < 0) && /^[a-z]+ [a-z]+$/.test(ngram)) {
        suggestedKind = 'PERSON';
      }
    }

    return {
      suggestedName: prettify(ngram),
      aliases: [aliasNormalised],
      matchCount: indices.size,
      sampleDescriptions,
      existsAs,
      suggestedKind,
    };
  });
}

@Injectable()
export class VendorExtractorService {
  constructor(private prisma: PrismaService) {}

  async extract(input: {
    source: 'all-transactions' | 'csv';
    csvBase64?: string;
    dateFrom?: string;
    dateTo?: string;
    accountIds?: string[];
  }): Promise<VendorCandidate[]> {
    let descriptions: string[];
    let amounts: number[];

    if (input.source === 'csv') {
      if (!input.csvBase64) throw new Error('csvBase64 required for source=csv');
      const buffer = Buffer.from(input.csvBase64, 'base64');
      const sniff = sniffCsv(buffer);
      const parsed = parseCsv(buffer, sniff.mapping);
      descriptions = parsed.rows.map((r) => r.description);
      amounts = parsed.rows.map((r) => Number(r.amount));
    } else {
      const where: any = {};
      if (input.accountIds?.length) where.accountId = { in: input.accountIds };
      if (input.dateFrom || input.dateTo) {
        where.date = {};
        if (input.dateFrom) where.date.gte = new Date(input.dateFrom);
        if (input.dateTo) where.date.lte = new Date(input.dateTo);
      }
      const rows = await this.prisma.transaction.findMany({
        where,
        select: { description: true, amount: true },
      });
      descriptions = rows.map((r) => r.description);
      amounts = rows.map((r) => Number(r.amount));
    }

    const existing = await this.prisma.vendor.findMany({
      where: { isActive: true },
      select: { name: true, aliases: true },
    });
    const existingAliases = new Map<string, string>();
    for (const v of existing) {
      for (const a of v.aliases) existingAliases.set(a.toLowerCase(), v.name);
    }

    return extractCandidates(descriptions, existingAliases, amounts);
  }

  async commit(candidates: Array<{ name: string; kind: string; aliases: string[] }>) {
    let created = 0, updated = 0, skipped = 0;
    for (const c of candidates) {
      const existing = await this.prisma.vendor.findUnique({ where: { name: c.name } });
      if (existing) {
        const newAliases = [...new Set([...existing.aliases, ...c.aliases.map((a) => a.toLowerCase())])];
        if (newAliases.length > existing.aliases.length) {
          await this.prisma.vendor.update({ where: { id: existing.id }, data: { aliases: newAliases } });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await this.prisma.vendor.create({
          data: {
            name: c.name,
            kind: c.kind as any,
            aliases: c.aliases.map((a) => a.toLowerCase()),
          },
        });
        created++;
      }
    }
    return { created, updated, skipped };
  }
}
