import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AiCompleteInput, AiCompleteResult } from './types';
import Ajv from 'ajv';

// Fetch dependency injection — defaults to global fetch. The spec passes a mock.
export type FetchFn = typeof fetch;

@Injectable()
export class AiClientService {
  private ajv: Ajv;

  constructor(
    private prisma: PrismaService,
    // globalThis.fetch is Node 18+ native fetch (undici). The `any` cast on globalThis
    // is needed because @types/node doesn't always type `fetch` as a global.
    @Optional() private fetchFn: FetchFn = (...a: any[]) => (globalThis as any).fetch(...a),
  ) {
    // `removeAdditional: 'all'` silently drops any keys the LLM returns that aren't in
    // the schema's `properties` list. This keeps the typed result T narrow — callers
    // receive only the fields they declared. Without it, AJV with `additionalProperties:
    // false` would reject the whole response on a single hallucinated key, wasting the
    // chain. The trade-off is intentional: prefer lenient stripping over strict reject.
    this.ajv = new Ajv({ allErrors: true, strict: false, removeAdditional: 'all' });
  }

  async complete<T = any>(input: AiCompleteInput): Promise<AiCompleteResult<T>> {
    const chain = await this.prisma.aiProvider.findMany({
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (chain.length === 0) return { ok: false, error: 'no-providers' };

    const validator = this.ajv.compile(input.jsonSchema.schema as any);
    let lastError: { providerId: string; httpStatus?: number; message: string } | undefined;

    for (let i = 0; i < chain.length; i++) {
      const provider = chain[i];
      const attempt = i + 1;
      const { ok, data, httpStatus, message, tokens, latencyMs } =
        await this.tryProvider<T>(provider, input, validator);

      // One AiCall row per provider attempt (NOT per HTTP attempt — the repair retry
      // inside tryProvider is collapsed into this single row). The spec describes "per
      // HTTP attempt" but the test expects per-provider, which is the observability
      // signal that matters: did this provider, in the end, succeed?
      if (ok) {
        await this.logCall(provider.id, input, 'OK', httpStatus ?? 200, null, tokens, latencyMs);
        return {
          ok: true,
          data: data!,
          providerId: provider.id,
          attempts: attempt,
          promptTokens: tokens.promptTokens,
          completionTokens: tokens.completionTokens,
        };
      }

      await this.logCall(provider.id, input, 'FAILED', httpStatus ?? null, message ?? null, tokens, latencyMs);
      lastError = { providerId: provider.id, httpStatus, message: message ?? 'unknown' };

      // 4xx other than 408/429 = misconfig, do not fall through.
      if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429) {
        return { ok: false, error: 'chain-exhausted', lastError };
      }
    }

    return { ok: false, error: 'chain-exhausted', lastError };
  }

  private async tryProvider<T>(
    provider: { id: string; apiBaseUrl: string; apiKey: string; model: string },
    input: AiCompleteInput,
    validator: ReturnType<Ajv['compile']>,
  ) {
    const t0 = Date.now();
    const tokens = { promptTokens: null as number | null, completionTokens: null as number | null };
    try {
      const body = {
        model: provider.model,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { ...input.jsonSchema, strict: true },
        },
        temperature: 0,
      };
      const res = await this.fetchFn(`${provider.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(input.timeoutMs),
      } as any);

      const latencyMs = Date.now() - t0;
      const status = res.status;
      const payload = await res.json().catch(() => null as any);

      if (status === 408 || status === 429 || status >= 500) {
        return { ok: false as const, httpStatus: status, message: payload?.error?.message ?? `HTTP ${status}`, tokens, latencyMs };
      }
      if (status >= 400) {
        return { ok: false as const, httpStatus: status, message: payload?.error?.message ?? `HTTP ${status}`, tokens, latencyMs };
      }

      const raw = payload?.choices?.[0]?.message?.content;
      if (typeof raw !== 'string') {
        return { ok: false as const, httpStatus: status, message: 'missing message.content', tokens, latencyMs };
      }
      tokens.promptTokens = payload?.usage?.prompt_tokens ?? null;
      tokens.completionTokens = payload?.usage?.completion_tokens ?? null;

      const parsed = this.parseAndValidate<T>(raw, validator);
      if (parsed.ok) {
        return { ok: true as const, data: parsed.data, httpStatus: status, message: undefined, tokens, latencyMs };
      }

      // Send the original messages + an additional user turn telling the model what was wrong
      // with the previous response. response_format and other top-level fields are unchanged.
      const repairBody = {
        ...body,
        messages: [
          ...body.messages,
          { role: 'user', content: `Your previous response failed validation: ${parsed.error}. Reply again with valid JSON only.` },
        ],
      };
      const res2 = await this.fetchFn(`${provider.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(repairBody),
        signal: AbortSignal.timeout(input.timeoutMs),
      } as any);
      const status2 = res2.status;
      const payload2 = await res2.json().catch(() => null as any);
      const raw2 = payload2?.choices?.[0]?.message?.content;
      const latency2 = Date.now() - t0;
      if (status2 < 400 && typeof raw2 === 'string') {
        const parsed2 = this.parseAndValidate<T>(raw2, validator);
        if (parsed2.ok) {
          tokens.promptTokens = payload2?.usage?.prompt_tokens ?? tokens.promptTokens;
          tokens.completionTokens = payload2?.usage?.completion_tokens ?? tokens.completionTokens;
          return { ok: true as const, data: parsed2.data, httpStatus: status2, message: undefined, tokens, latencyMs: latency2 };
        }
        return { ok: false as const, httpStatus: status2, message: `schema invalid after repair: ${parsed2.error}`, tokens, latencyMs: latency2 };
      }
      return { ok: false as const, httpStatus: status2, message: `repair retry failed (HTTP ${status2})`, tokens, latencyMs: latency2 };
    } catch (e: any) {
      const latencyMs = Date.now() - t0;
      // Native fetch + AbortSignal.timeout() throws a DOMException with name='TimeoutError'
      // (or 'AbortError' if the caller aborts manually). The older string 'ABORT_ERR' code
      // is from node-fetch/older Node http and never fires here.
      const message = e?.name === 'AbortError' || e?.name === 'TimeoutError'
        ? `timeout after ${input.timeoutMs}ms`
        : (e?.message || String(e));
      return { ok: false as const, httpStatus: undefined, message, tokens, latencyMs };
    }
  }

  private parseAndValidate<T>(raw: string, validator: ReturnType<Ajv['compile']>):
    | { ok: true; data: T }
    | { ok: false; error: string } {
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch (e: any) { return { ok: false, error: `not JSON: ${e?.message}` }; }
    const valid = validator(parsed);
    if (!valid) return { ok: false, error: this.ajv.errorsText(validator.errors) };
    return { ok: true, data: parsed as T };
  }

  private async logCall(
    providerId: string,
    input: AiCompleteInput,
    status: 'OK' | 'FAILED',
    httpStatus: number | null,
    errorMessage: string | null,
    tokens: { promptTokens: number | null; completionTokens: number | null },
    latencyMs: number,
  ) {
    try {
      await this.prisma.aiCall.create({
        data: {
          providerId,
          purpose: input.purpose,
          promptTokens: tokens.promptTokens,
          completionTokens: tokens.completionTokens,
          latencyMs,
          status,
          httpStatus,
          errorMessage,
          transactionId: input.contextIds?.transactionId ?? null,
          ruleId: input.contextIds?.ruleId ?? null,
        },
      });
    } catch {
      // Logging failure must never break the chain.
    }
  }
}
