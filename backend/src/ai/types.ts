// backend/src/ai/types.ts
export type AiConfidence = 'high' | 'med' | 'low';

export interface JsonSchema { name: string; schema: object }

export interface AiCompleteInput {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: JsonSchema;
  purpose: 'CATEGORISE' | 'DRAFT_RULE';
  timeoutMs: number;
  contextIds?: { transactionId?: string; ruleId?: string };
}

export interface AiCompleteOk<T> {
  ok: true;
  data: T;
  providerId: string;
  attempts: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface AiCompleteFail {
  ok: false;
  error: 'no-providers' | 'chain-exhausted';
  lastError?: { providerId: string; httpStatus?: number; message: string };
}

export type AiCompleteResult<T> = AiCompleteOk<T> | AiCompleteFail;

// Schema for the category-suggestion response (returned by AiCategoriser).
export interface CategoriseLlmResponse {
  categoryId: string | null;
  confidence: AiConfidence;
  reasoning: string;
}

// Schema for the rule-draft response (returned by AiRuleDrafter).
export interface DraftRuleLlmResponse {
  name: string;
  conditions: Array<{
    field: 'DESCRIPTION' | 'AMOUNT' | 'ACCOUNT';
    operator: 'CONTAINS' | 'EQUALS' | 'STARTS_WITH' | 'ENDS_WITH' | 'GT' | 'LT' | 'BETWEEN' | 'IN';
    value: string;
    value2: string | null;
  }>;
  reasoning: string;
}
