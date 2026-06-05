import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Deterministic per-transaction customer linker. Three signals, evaluated
// per-row in priority order. First confident hit wins and writes
// Transaction.linkedCustomerId + linkedCustomerSource.
//
// 1. INVOICE_NUMBER  — description contains an open invoice number → its customer
// 2. EXACT_AMOUNT    — |tx.amount| matches the outstanding of exactly one open invoice → its customer
// 3. NAME_TOKEN      — a ≥4-char token from a customer's name appears as a whole-word substring, unambiguously
//
// Never overwrites a non-null linkedCustomerId (including MANUAL). Idempotent;
// safe to re-run.
const OPEN_STATUSES = ['SENT', 'VIEWED', 'PARTIAL_PAID'] as const;
const INVOICE_NUMBER_RE = /\bINV(?:OICE)?[-\s#]*0*(\d{3,6})\b/gi;
const STANDALONE_NUMBER_RE = /\b(\d{4,6})\b/g;

export type LinkSource = 'INVOICE_NUMBER' | 'EXACT_AMOUNT' | 'NAME_TOKEN' | 'MANUAL';

export interface LinkResult {
  scanned: number;
  matched: number;
  bySource: Record<LinkSource, number>;
}

@Injectable()
export class CustomerLinkerService {
  private readonly log = new Logger(CustomerLinkerService.name);

  constructor(private prisma: PrismaService) {}

  async linkAll(opts?: { transactionIds?: string[]; force?: boolean }): Promise<LinkResult> {
    const where: any = {};
    if (opts?.transactionIds?.length) where.id = { in: opts.transactionIds };
    if (!opts?.force) where.linkedCustomerId = null;

    const txns = await this.prisma.transaction.findMany({
      where,
      select: { id: true, description: true, amount: true },
    });

    // Pre-load open invoices + customers once.
    const openInvoices = await this.prisma.invoice.findMany({
      where: { status: { in: OPEN_STATUSES as any }, customerId: { not: null } as any },
      select: { invoiceNumber: true, customerId: true, amountOutstanding: true },
    });
    const invByNumber = new Map<number, string>();
    for (const inv of openInvoices) {
      if (inv.customerId) invByNumber.set(inv.invoiceNumber, inv.customerId);
    }
    const amountIndex = new Map<string, Set<string>>();
    for (const inv of openInvoices) {
      if (!inv.customerId) continue;
      const k = inv.amountOutstanding.toString();
      const set = amountIndex.get(k) ?? new Set();
      set.add(inv.customerId);
      amountIndex.set(k, set);
    }

    const customers = await this.prisma.customer.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    // Map of token → set of customerIds it appears in (so ambiguous tokens are rejected).
    const tokenIndex = new Map<string, Set<string>>();
    for (const c of customers) {
      const tokens = c.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
      for (const t of tokens) {
        const set = tokenIndex.get(t) ?? new Set();
        set.add(c.id);
        tokenIndex.set(t, set);
      }
    }

    const bySource: Record<LinkSource, number> = {
      INVOICE_NUMBER: 0,
      EXACT_AMOUNT: 0,
      NAME_TOKEN: 0,
      MANUAL: 0,
    };
    let matched = 0;

    for (const tx of txns) {
      const desc = tx.description ?? '';
      let customerId: string | null = null;
      let source: LinkSource | null = null;

      // Signal 1: invoice-number tokens
      const numbers: number[] = [];
      for (const m of desc.matchAll(INVOICE_NUMBER_RE)) numbers.push(Number(m[1]));
      for (const m of desc.matchAll(STANDALONE_NUMBER_RE)) numbers.push(Number(m[1]));
      for (const n of numbers) {
        const c = invByNumber.get(n);
        if (c) { customerId = c; source = 'INVOICE_NUMBER'; break; }
      }

      // Signal 2: exact amount, unambiguous
      if (!customerId) {
        const abs = Math.abs(Number(tx.amount));
        const k = abs.toFixed(2);
        const set = amountIndex.get(k);
        if (set && set.size === 1) {
          customerId = [...set][0];
          source = 'EXACT_AMOUNT';
        }
      }

      // Signal 3: unambiguous customer-name token
      if (!customerId) {
        const tokens = desc.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
        const hits = new Set<string>();
        for (const t of tokens) {
          const ids = tokenIndex.get(t);
          if (ids) for (const id of ids) hits.add(id);
        }
        if (hits.size === 1) {
          customerId = [...hits][0];
          source = 'NAME_TOKEN';
        }
      }

      if (customerId && source) {
        await this.prisma.transaction.update({
          where: { id: tx.id },
          data: { linkedCustomerId: customerId, linkedCustomerSource: source },
        });
        bySource[source]++;
        matched++;
      }
    }

    this.log.log(
      `linkAll: scanned=${txns.length} matched=${matched} byInv=${bySource.INVOICE_NUMBER} byAmt=${bySource.EXACT_AMOUNT} byName=${bySource.NAME_TOKEN}`,
    );
    return { scanned: txns.length, matched, bySource };
  }
}
