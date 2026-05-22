// backend/src/ai/prompts/categorise.ts
import type { JsonSchema } from '../types';

export const CATEGORISE_SYSTEM_PROMPT = `You are a bookkeeping assistant for SimpleBooks. You categorise bank
transactions for a small business. The user has defined a fixed list of
categories and vendors; you must choose from those lists only.

Output strict JSON matching the provided schema. If you cannot pick a
category with at least "low" confidence, return categoryId=null and
explain in \`reasoning\` what's missing. Never invent an id.

The user's recent manual categorisations are provided as examples.
Mimic the user's patterns, do not impose your own taxonomy.`;

export const CATEGORISE_SCHEMA: JsonSchema = {
  name: 'categorise_response',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['categoryId', 'vendorId', 'confidence', 'reasoning'],
    properties: {
      categoryId: { type: ['string', 'null'] },
      vendorId:   { type: ['string', 'null'] },
      confidence: { type: 'string', enum: ['high', 'med', 'low'] },
      reasoning:  { type: 'string', maxLength: 200 },
    },
  },
};

export interface CategoriseUserPromptInput {
  categories: Array<{ id: string; name: string; kind: string; usageCount: number }>;
  vendors: Array<{ id: string; name: string; aliases: string[] }>;
  fewShots: Array<{ date: string; amount: string; description: string; categoryName: string }>;
  tx: {
    date: string;
    amount: string;
    description: string;
    vendorGuess: string | null;
    accountName: string;
  };
}

export function buildCategoriseUserPrompt(i: CategoriseUserPromptInput): string {
  const cats = i.categories.map((c) => `  ${c.id} | ${c.name} | ${c.kind} | ${c.usageCount}`).join('\n');
  const vens = i.vendors.map((v) => `  ${v.id} | ${v.name} | ${v.aliases.join(', ')}`).join('\n');
  const shots = i.fewShots.length
    ? i.fewShots.map((s) => `  ${s.date} | ${s.amount} | ${s.description} | ${s.categoryName}`).join('\n')
    : '  (none yet — user has no manual history)';
  return [
    'CATEGORIES (id | name | kind | times-used-by-user):',
    cats,
    '',
    'VENDORS (id | name | known aliases):',
    vens,
    '',
    'RECENT MANUAL CATEGORISATIONS (your reference for this user\'s patterns):',
    shots,
    '',
    'TRANSACTION TO CATEGORISE:',
    `  Date:        ${i.tx.date}`,
    `  Amount:      ${i.tx.amount}`,
    `  Description: ${i.tx.description}`,
    `  Vendor (rule-engine guess, may be null): ${i.tx.vendorGuess ?? 'null'}`,
    `  Account:     ${i.tx.accountName}`,
  ].join('\n');
}
