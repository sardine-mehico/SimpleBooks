// backend/src/ai/prompts/categorise.ts
import type { JsonSchema } from '../types';

export const CATEGORISE_SYSTEM_PROMPT = `You are a bookkeeping assistant for SimpleBooks. You categorise bank
transactions for a small business. The user has defined a fixed list of
categories; you must choose from that list only.

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
    required: ['categoryId', 'confidence', 'reasoning'],
    properties: {
      categoryId: { type: ['string', 'null'] },
      confidence: { type: 'string', enum: ['high', 'med', 'low'] },
      reasoning:  { type: 'string', maxLength: 200 },
    },
  },
};

export interface CategoriseUserPromptInput {
  categories: Array<{ id: string; name: string; kind: string; usageCount: number; parentName: string | null }>;
  fewShots: Array<{ date: string; amount: string; description: string; categoryName: string }>;
  tx: {
    date: string;
    amount: string;
    description: string;
    accountName: string;
  };
}

export function buildCategoriseUserPrompt(i: CategoriseUserPromptInput): string {
  const cats = i.categories.map((c) => {
    const display = c.parentName ? `${c.parentName} > ${c.name}` : c.name;
    return `  ${c.id} | ${display} | ${c.kind} | ${c.usageCount}`;
  }).join('\n');
  const shots = i.fewShots.length
    ? i.fewShots.map((s) => `  ${s.date} | ${s.amount} | ${s.description} | ${s.categoryName}`).join('\n')
    : '  (none yet — user has no manual history)';
  return [
    'CATEGORIES (id | name | kind | times-used-by-user):',
    cats,
    '',
    'RECENT MANUAL CATEGORISATIONS (your reference for this user\'s patterns):',
    shots,
    '',
    'TRANSACTION TO CATEGORISE:',
    `  Date:        ${i.tx.date}`,
    `  Amount:      ${i.tx.amount}`,
    `  Description: ${i.tx.description}`,
    `  Account:     ${i.tx.accountName}`,
  ].join('\n');
}
