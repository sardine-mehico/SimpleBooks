import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiClientService } from './ai-client.service';

// === Exported helpers (testable in isolation) ===
//
// These helpers stay in place for the future re-enable. The mine() method
// itself is currently disabled — see comment on the class below.

export function clusterKey(description: string): string | null {
  if (!description) return null;
  const upper = description.toUpperCase().replace(/\s+/g, ' ').trim();
  const allTokens = upper.split(' ');

  // Keep only tokens that appear before the first token containing a digit.
  // This strips merchant-location suffixes like "1234 SUBIACO" or "0078 KARRINYUP WA"
  // that appear after the numeric part of the description.
  const preDigit: string[] = [];
  for (const t of allTokens) {
    if (/\d/.test(t)) break;
    preDigit.push(t);
  }

  // From the pre-digit tokens, keep purely alphabetic ones of length >= 2.
  const alpha = preDigit.filter((t) => /^[A-Z]{2,}$/.test(t));

  if (alpha.length === 0) return null;
  const key = alpha.slice(0, 2).join(' ');
  if (key.length < 3) return null;
  return key;
}

export function computeClusterHash(key: string, categoryId: string): string {
  return createHash('sha256').update(`${key}|${categoryId}`).digest('hex').slice(0, 16);
}

export interface RawEvent {
  newCategoryId: string;
  transaction: { description: string; amount: string; date: Date };
}

export interface Cluster {
  clusterKey: string;
  newCategoryId: string;
  size: number;
  clusterHash: string;
  sampleDescriptions: string[];
}

// === Service ===
//
// DISABLED as of 2026-05-28 (Vendor->Tags migration). The previous clustering
// signal leaned on vendor-name patterns. With Vendor gone, the drafter needs
// a new signal (likely description-prefix or token-frequency mining) before
// it can be re-enabled. mine() currently early-returns with a disabled marker
// so the controller and any cron caller still type-check and respond, just
// without writing AI_DRAFTED rules.

@Injectable()
export class AiRuleDrafterService {
  private readonly logger = new Logger(AiRuleDrafterService.name);

  constructor(private prisma: PrismaService, private ai: AiClientService) {}

  async mine(): Promise<{ drafted: number; skippedSuppressed: number; clustersConsidered: number; failed: number; disabled?: true }> {
    this.logger.warn('AiRuleDrafter.mine() is disabled pending re-implementation with a non-vendor clustering signal.');
    return { drafted: 0, skippedSuppressed: 0, clustersConsidered: 0, failed: 0, disabled: true };
  }
}
