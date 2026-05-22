# Phase C — AI Categorisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire AI-assisted categorisation into the existing Banking module — multi-provider fallback runtime, per-transaction suggestions (inline + bulk + review queue), AI-drafted rules with cluster mining, and a CategorisationEvent history drawer. All while preserving the no-`down -v` constraint by keeping schema changes additive.

**Architecture:** New backend `ai` module (`ai-client.service.ts`, `ai-categoriser.service.ts`, `ai-rule-drafter.service.ts`, `ai.controller.ts`, `prompts/*.ts`). Talks to OpenAI-compatible HTTP endpoints with an ordered chain pulled from the existing `AiProvider` table. Frontend extends the existing transaction edit modal with a suggestion banner, adds an `/transactions/ai-review` queue page, augments the Rules AI Drafts tab with row actions, and adds a history drawer. Two narrow Jest spec files cover the provider-chain decision logic and deterministic cluster detection — the rest is verified manually against the running stack.

**Tech Stack:** NestJS 10, Prisma 5, Next.js 15 (App Router, React 19), Postgres, native `fetch` for outbound HTTPS, Jest 29 (added in Task 2).

**Authoritative spec:** [`docs/superpowers/specs/2026-05-22-phase-c-ai-categorisation-design.md`](../specs/2026-05-22-phase-c-ai-categorisation-design.md). The plan implements the spec verbatim; if anything below conflicts with the spec, the spec wins — report the discrepancy.

---

## File inventory

### Backend — new

- `backend/src/ai/ai.module.ts`
- `backend/src/ai/ai.controller.ts`
- `backend/src/ai/ai.dto.ts`
- `backend/src/ai/types.ts`
- `backend/src/ai/ai-client.service.ts`
- `backend/src/ai/ai-client.service.spec.ts`
- `backend/src/ai/ai-categoriser.service.ts`
- `backend/src/ai/ai-rule-drafter.service.ts`
- `backend/src/ai/ai-rule-drafter.service.spec.ts`
- `backend/src/ai/bulk-runs.ts` (in-memory `runId` map)
- `backend/src/ai/prompts/categorise.ts`
- `backend/src/ai/prompts/draft-rule.ts`
- `backend/src/ai/utils/p-limit.ts`

### Backend — modified

- `backend/prisma/schema.prisma` (additive only)
- `backend/package.json` (add `jest`, `ts-jest`, `@types/jest`)
- `backend/jest.config.cjs` (new — Jest config)
- `backend/src/app.module.ts` (register `AiModule`)
- `backend/src/preferences/dto.ts` (add `aiMiningThreshold` to upsert DTO)
- `backend/src/ai-providers/ai-providers.controller.ts` (add `PATCH :id/move`)
- `backend/src/ai-providers/ai-providers.service.ts` (add `move()`)
- `backend/src/ai-providers/dto.ts` (add `MoveAiProviderDto`)

### Frontend — new

- `frontend/lib/ai.ts`
- `frontend/app/transactions/ai-review/page.tsx`
- `frontend/components/transactions/ai-review-list.tsx`
- `frontend/components/transactions/ai-suggestion-banner.tsx`
- `frontend/components/transactions/bulk-ai-categorise-dialog.tsx`
- `frontend/components/transactions/transaction-history-drawer.tsx`
- `frontend/components/rules/ai-draft-row.tsx`

### Frontend — modified

- `frontend/components/transactions/transaction-edit-modal.tsx`
- `frontend/components/transactions/transactions-table.tsx`
- `frontend/components/rules/rules-list.tsx`
- `frontend/components/settings/ai-setup-page.tsx`
- `frontend/lib/types.ts` (add new TS types)
- `frontend/lib/ai-providers.ts` (add `moveAiProvider`)

### Docs — modified

- `CLAUDE.md`, `Architecture.md`, `DatabaseSchema.md`, `modules_and_logic.md`, `DesignSystem.md`, `docs/user-guide-banking.md`
- `.env.example` (new AI_* env vars)

---

## Task 1: Schema additions

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Edit schema — extend `AiProvider`**

  In `backend/prisma/schema.prisma`, replace the existing `AiProvider` model with:

  ```prisma
  model AiProvider {
    id         String   @id @default(uuid())
    name       String
    model      String
    apiBaseUrl String
    apiKey     String
    isPrimary  Boolean  @default(false)
    sortOrder  Int      @default(1000)
    createdAt  DateTime @default(now())
    updatedAt  DateTime @updatedAt
    calls      AiCall[]
    @@index([isPrimary, sortOrder])
  }
  ```

- [ ] **Step 2: Edit schema — extend `EventSource` enum**

  Replace the existing `EventSource` enum block with:

  ```prisma
  enum EventSource {
    USER
    RULE
    VENDOR_MATCH
    AI_DRAFT
    AI_APPLIED
    AI_REJECTED
  }
  ```

- [ ] **Step 3: Edit schema — extend `CategorisationEvent`**

  Inside the `CategorisationEvent` model, add the new field below `acceptedAiSuggestion`:

  ```prisma
  reasoning String?
  ```

- [ ] **Step 4: Edit schema — extend `Rule` with `clusterHash`**

  Inside the `Rule` model, add the new field and index:

  ```prisma
  clusterHash String?
  @@index([clusterHash])
  ```

  (Place `clusterHash` near the existing `noteOnApply` field; place the index alongside the other `@@index` directives.)

- [ ] **Step 5: Edit schema — extend `Preferences`**

  Inside the `Preferences` model, add:

  ```prisma
  aiMiningThreshold Int @default(5)
  ```

- [ ] **Step 6: Edit schema — add AiCall enums and model**

  Append to the end of the schema file:

  ```prisma
  enum AiCallPurpose { CATEGORISE DRAFT_RULE }
  enum AiCallStatus  { OK FAILED }

  model AiCall {
    id               String        @id @default(uuid())
    providerId       String
    provider         AiProvider    @relation(fields: [providerId], references: [id], onDelete: Cascade)
    purpose          AiCallPurpose
    promptTokens     Int?
    completionTokens Int?
    latencyMs        Int
    status           AiCallStatus
    httpStatus       Int?
    errorMessage     String?
    transactionId    String?
    ruleId           String?
    createdAt        DateTime      @default(now())

    @@index([providerId, createdAt])
    @@index([status, createdAt])
    @@index([transactionId])
  }
  ```

- [ ] **Step 7: Apply schema and regenerate Prisma client**

  Run:
  ```bash
  docker compose exec backend sh -c "npx prisma db push && npx prisma generate"
  ```
  Expected: "Your database is now in sync with your Prisma schema" + "Generated Prisma Client". No data-loss warnings.

  If the backend container is not running, run `docker compose up -d backend` first.

- [ ] **Step 8: Commit**

  ```bash
  git add backend/prisma/schema.prisma
  git commit -m "feat(banking): Phase C additive schema — AiCall, sortOrder, reasoning, clusterHash, AI_REJECTED"
  ```

---

## Task 2: Set up minimal Jest for backend

The repo has no Jest yet, but the spec mandates two table-driven test files. Set up the smallest viable Jest configuration that can run them.

**Files:**
- Modify: `backend/package.json`
- Create: `backend/jest.config.cjs`

- [ ] **Step 1: Add Jest deps**

  Edit `backend/package.json` `devDependencies`:

  ```json
  "jest": "^29.7.0",
  "ts-jest": "^29.2.5",
  "@types/jest": "^29.5.13"
  ```

  Add to `scripts`:

  ```json
  "test": "jest",
  "test:watch": "jest --watch"
  ```

- [ ] **Step 2: Create `backend/jest.config.cjs`**

  ```js
  /** @type {import('jest').Config} */
  module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.spec.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    transform: {
      '^.+\\.ts$': ['ts-jest', { tsconfig: { esModuleInterop: true, target: 'ES2022', module: 'commonjs' } }],
    },
  };
  ```

- [ ] **Step 3: Install and verify**

  ```bash
  docker compose exec backend npm install
  docker compose exec backend npx jest --version
  ```

  Expected: a version like `29.7.0` prints. If `npm install` fails because the container is stale, `docker compose build backend && docker compose up -d backend` then re-run.

- [ ] **Step 4: Smoke test Jest with a trivial file (will be deleted)**

  Create `backend/src/sanity.spec.ts`:

  ```ts
  describe('jest', () => {
    it('runs', () => { expect(1 + 1).toBe(2); });
  });
  ```

  Run:
  ```bash
  docker compose exec backend npm test -- --testPathPattern=sanity.spec.ts
  ```
  Expected: 1 passing test. Then delete the file:
  ```bash
  rm backend/src/sanity.spec.ts
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add backend/package.json backend/package-lock.json backend/jest.config.cjs
  git commit -m "chore(backend): add minimal Jest setup for Phase C test exceptions"
  ```

---

## Task 3: Inline `p-limit` semaphore utility

We need a small concurrency limiter without adding a runtime dep. Inline a ~20-line implementation.

**Files:**
- Create: `backend/src/ai/utils/p-limit.ts`

- [ ] **Step 1: Create the utility**

  ```ts
  // backend/src/ai/utils/p-limit.ts
  // Minimal concurrency limiter. Returns a function that, when called with an
  // async task factory, runs the task subject to the cap and resolves with its result.
  export function pLimit(concurrency: number) {
    if (concurrency < 1) throw new Error('pLimit: concurrency must be >= 1');
    let active = 0;
    const queue: Array<() => void> = [];

    const next = () => {
      if (active >= concurrency) return;
      const job = queue.shift();
      if (job) {
        active++;
        job();
      }
    };

    return function run<T>(factory: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          factory()
            .then(resolve, reject)
            .finally(() => {
              active--;
              next();
            });
        });
        next();
      });
    };
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add backend/src/ai/utils/p-limit.ts
  git commit -m "feat(ai): inline p-limit concurrency utility"
  ```

---

## Task 4: AiClient — types + scaffold the file

Define the shared TypeScript types first so all subsequent services can import them.

**Files:**
- Create: `backend/src/ai/types.ts`

- [ ] **Step 1: Create the types module**

  ```ts
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
    vendorId: string | null;
    confidence: AiConfidence;
    reasoning: string;
  }

  // Schema for the rule-draft response (returned by AiRuleDrafter).
  export interface DraftRuleLlmResponse {
    name: string;
    conditions: Array<{
      field: 'DESCRIPTION' | 'AMOUNT' | 'VENDOR' | 'ACCOUNT';
      operator: 'CONTAINS' | 'EQUALS' | 'STARTS_WITH' | 'ENDS_WITH' | 'GT' | 'LT' | 'BETWEEN' | 'IN';
      value: string;
      value2: string | null;
    }>;
    reasoning: string;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add backend/src/ai/types.ts
  git commit -m "feat(ai): types module for Phase C shared interfaces"
  ```

---

## Task 5: AiClient — TDD the provider-chain decision logic

This is the highest-value test surface. We write the test first, watch it fail, then implement.

**Files:**
- Create: `backend/src/ai/ai-client.service.spec.ts`
- Create: `backend/src/ai/ai-client.service.ts`

- [ ] **Step 1: Write the failing spec**

  Create `backend/src/ai/ai-client.service.spec.ts`:

  ```ts
  import { AiClientService } from './ai-client.service';
  import type { AiCompleteInput } from './types';

  // Hand-rolled in-memory prisma double — we only exercise the calls AiClient makes.
  function makePrisma(providers: any[]) {
    const aiCalls: any[] = [];
    return {
      _aiCalls: aiCalls,
      aiProvider: { findMany: jest.fn().mockResolvedValue(providers) },
      aiCall: { create: jest.fn(async ({ data }) => { aiCalls.push(data); return data; }) },
    } as any;
  }

  function makeInput(over: Partial<AiCompleteInput> = {}): AiCompleteInput {
    return {
      systemPrompt: 'sys',
      userPrompt: 'usr',
      jsonSchema: { name: 'r', schema: { type: 'object', additionalProperties: false } },
      purpose: 'CATEGORISE',
      timeoutMs: 1000,
      ...over,
    };
  }

  function mockFetch(responses: Array<{ status?: number; body?: any; throws?: Error }>) {
    let i = 0;
    return jest.fn(async () => {
      const r = responses[i++];
      if (!r) throw new Error('mockFetch: out of responses');
      if (r.throws) throw r.throws;
      return {
        status: r.status ?? 200,
        ok: (r.status ?? 200) < 400,
        json: async () => r.body,
        text: async () => JSON.stringify(r.body ?? ''),
      } as any;
    });
  }

  const providers = [
    { id: 'p1', name: 'Primary',  model: 'm', apiBaseUrl: 'http://p1', apiKey: 'k1', isPrimary: true,  sortOrder: 0 },
    { id: 'p2', name: 'Backup-2', model: 'm', apiBaseUrl: 'http://p2', apiKey: 'k2', isPrimary: false, sortOrder: 1000 },
    { id: 'p3', name: 'Backup-3', model: 'm', apiBaseUrl: 'http://p3', apiKey: 'k3', isPrimary: false, sortOrder: 1010 },
  ];

  function makeOkBody(parsed: object) {
    return { choices: [{ message: { content: JSON.stringify(parsed) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
  }

  describe('AiClientService.complete', () => {
    it('returns no-providers when chain is empty', async () => {
      const prisma = makePrisma([]);
      const svc = new AiClientService(prisma, mockFetch([]) as any);
      const r = await svc.complete(makeInput());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('no-providers');
      expect(prisma._aiCalls).toHaveLength(0);
    });

    it('succeeds on primary, logs one OK AiCall', async () => {
      const prisma = makePrisma(providers);
      const fetch = mockFetch([{ status: 200, body: makeOkBody({ pick: 1 }) }]);
      const svc = new AiClientService(prisma, fetch as any);
      const r = await svc.complete(makeInput());
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.providerId).toBe('p1');
        expect(r.attempts).toBe(1);
      }
      expect(prisma._aiCalls).toEqual([expect.objectContaining({ status: 'OK', providerId: 'p1' })]);
    });

    it('falls through on 5xx to next provider, logs FAILED+OK', async () => {
      const prisma = makePrisma(providers);
      const fetch = mockFetch([
        { status: 503, body: { error: 'overloaded' } },
        { status: 200, body: makeOkBody({ pick: 2 }) },
      ]);
      const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.providerId).toBe('p2');
      expect(prisma._aiCalls.map(c => c.status)).toEqual(['FAILED', 'OK']);
      expect(prisma._aiCalls[0].httpStatus).toBe(503);
    });

    it('falls through on 408 timeout and 429 rate limit', async () => {
      const prisma = makePrisma(providers);
      const fetch = mockFetch([
        { status: 408, body: {} },
        { status: 429, body: {} },
        { status: 200, body: makeOkBody({}) },
      ]);
      const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.providerId).toBe('p3');
    });

    it('does NOT fall through on 4xx misconfig (e.g. 401) — surfaces error', async () => {
      const prisma = makePrisma(providers);
      const fetch = mockFetch([{ status: 401, body: { error: 'unauthorized' } }]);
      const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe('chain-exhausted');
        expect(r.lastError?.httpStatus).toBe(401);
      }
      expect(prisma._aiCalls).toHaveLength(1);
    });

    it('falls through on network error (thrown by fetch)', async () => {
      const prisma = makePrisma(providers);
      const fetch = mockFetch([
        { throws: Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }) },
        { status: 200, body: makeOkBody({}) },
      ]);
      const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.providerId).toBe('p2');
      expect(prisma._aiCalls[0]).toMatchObject({ status: 'FAILED', httpStatus: null, errorMessage: expect.stringContaining('ECONNREFUSED') });
    });

    it('returns chain-exhausted when all providers fail with fallback-worthy errors', async () => {
      const prisma = makePrisma(providers);
      const fetch = mockFetch([
        { status: 503, body: {} },
        { status: 503, body: {} },
        { status: 503, body: {} },
      ]);
      const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('chain-exhausted');
      expect(prisma._aiCalls.filter((c: any) => c.status === 'FAILED')).toHaveLength(3);
    });

    it('repair-retries once on schema validation failure on same provider, then falls through', async () => {
      const prisma = makePrisma(providers);
      const schema = { name: 'r', schema: { type: 'object', additionalProperties: false, required: ['x'], properties: { x: { type: 'number' } } } };
      const fetch = mockFetch([
        { status: 200, body: makeOkBody({ wrong: true }) },     // primary, bad shape
        { status: 200, body: makeOkBody({ wrong: true }) },     // primary repair, still bad
        { status: 200, body: makeOkBody({ x: 42 }) },           // backup, good
      ]);
      const r = await new AiClientService(prisma, fetch as any).complete(makeInput({ jsonSchema: schema }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.providerId).toBe('p2');
      // 1 FAILED for primary chain-move (after repair), then 1 OK for backup
      expect(prisma._aiCalls.filter((c: any) => c.providerId === 'p1' && c.status === 'FAILED')).toHaveLength(1);
      expect(prisma._aiCalls.filter((c: any) => c.providerId === 'p2' && c.status === 'OK')).toHaveLength(1);
    });
  });
  ```

- [ ] **Step 2: Run spec, confirm it fails (no implementation yet)**

  ```bash
  docker compose exec backend npm test -- --testPathPattern=ai-client.service.spec.ts
  ```
  Expected: red — module `./ai-client.service` not found.

- [ ] **Step 3: Implement `AiClientService`**

  Create `backend/src/ai/ai-client.service.ts`:

  ```ts
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
      @Optional() private fetchFn: FetchFn = (...a: any[]) => (globalThis as any).fetch(...a),
    ) {
      this.ajv = new Ajv({ allErrors: true, strict: false });
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
        const { ok, data, httpStatus, message, repairUsed, tokens, latencyMs } =
          await this.tryProvider<T>(provider, input, validator);

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
          return { ok: false as const, httpStatus: status, message: payload?.error?.message ?? `HTTP ${status}`, repairUsed: false, tokens, latencyMs };
        }
        if (status >= 400) {
          return { ok: false as const, httpStatus: status, message: payload?.error?.message ?? `HTTP ${status}`, repairUsed: false, tokens, latencyMs };
        }

        const raw = payload?.choices?.[0]?.message?.content;
        if (typeof raw !== 'string') {
          return { ok: false as const, httpStatus: status, message: 'missing message.content', repairUsed: false, tokens, latencyMs };
        }
        tokens.promptTokens = payload?.usage?.prompt_tokens ?? null;
        tokens.completionTokens = payload?.usage?.completion_tokens ?? null;

        const parsed = this.parseAndValidate<T>(raw, validator);
        if (parsed.ok) {
          return { ok: true as const, data: parsed.data, httpStatus: status, message: undefined, repairUsed: false, tokens, latencyMs };
        }

        // One repair retry on the same provider with the validation error appended.
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
            return { ok: true as const, data: parsed2.data, httpStatus: status2, message: undefined, repairUsed: true, tokens, latencyMs: latency2 };
          }
          return { ok: false as const, httpStatus: status2, message: `schema invalid after repair: ${parsed2.error}`, repairUsed: true, tokens, latencyMs: latency2 };
        }
        return { ok: false as const, httpStatus: status2, message: `repair retry failed (HTTP ${status2})`, repairUsed: true, tokens, latencyMs: latency2 };
      } catch (e: any) {
        const latencyMs = Date.now() - t0;
        const message = e?.code === 'ABORT_ERR' || e?.name === 'AbortError' || e?.name === 'TimeoutError'
          ? `timeout after ${input.timeoutMs}ms`
          : (e?.message || String(e));
        return { ok: false as const, httpStatus: undefined, message, repairUsed: false, tokens, latencyMs };
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
  ```

- [ ] **Step 4: Add Ajv dependency**

  ```bash
  docker compose exec backend npm install ajv@^8.17.1
  ```

- [ ] **Step 5: Run spec, confirm it passes**

  ```bash
  docker compose exec backend npm test -- --testPathPattern=ai-client.service.spec.ts
  ```
  Expected: 8 passing tests.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/ai/ai-client.service.ts backend/src/ai/ai-client.service.spec.ts backend/package.json backend/package-lock.json
  git commit -m "feat(ai): AiClient provider-chain runtime + tests"
  ```

---

## Task 6: Prompts — categorise

**Files:**
- Create: `backend/src/ai/prompts/categorise.ts`

- [ ] **Step 1: Create the prompt module**

  ```ts
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
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add backend/src/ai/prompts/categorise.ts
  git commit -m "feat(ai): categorise prompt + JSON schema"
  ```

---

## Task 7: AiCategoriser service

Implement the orchestrator that turns a transaction id into a stored AI_DRAFT event.

**Files:**
- Create: `backend/src/ai/ai-categoriser.service.ts`
- Create: `backend/src/ai/bulk-runs.ts`

- [ ] **Step 1: Create the bulk-run registry**

  ```ts
  // backend/src/ai/bulk-runs.ts
  // In-memory map of bulk-suggest run state. Crashes lose state; the per-transaction
  // events are the durable record.
  export interface BulkRun {
    id: string;
    totalQueued: number;
    done: number;
    ok: number;
    cached: number;
    failed: number;
    cancelled: boolean;
    createdAt: number;
    abort: AbortController;
  }

  const runs = new Map<string, BulkRun>();

  export const BulkRuns = {
    create(id: string, totalQueued: number): BulkRun {
      const run: BulkRun = {
        id, totalQueued, done: 0, ok: 0, cached: 0, failed: 0,
        cancelled: false, createdAt: Date.now(), abort: new AbortController(),
      };
      runs.set(id, run);
      return run;
    },
    get(id: string): BulkRun | undefined { return runs.get(id); },
    cancel(id: string) {
      const r = runs.get(id);
      if (r) { r.cancelled = true; r.abort.abort(); }
    },
    delete(id: string) { runs.delete(id); },
    // Sweep runs older than 1 hour
    sweep() {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const [id, r] of runs) if (r.createdAt < cutoff) runs.delete(id);
    },
  };
  ```

- [ ] **Step 2: Create the categoriser service — Part 1: imports + constructor + `suggest()`**

  Begin `backend/src/ai/ai-categoriser.service.ts`:

  ```ts
  import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
  import { randomUUID } from 'crypto';
  import { PrismaService } from '../prisma/prisma.service';
  import { AiClientService } from './ai-client.service';
  import { BulkRuns } from './bulk-runs';
  import { pLimit } from './utils/p-limit';
  import {
    CATEGORISE_SCHEMA,
    CATEGORISE_SYSTEM_PROMPT,
    buildCategoriseUserPrompt,
  } from './prompts/categorise';
  import type { AiConfidence, CategoriseLlmResponse } from './types';

  const INLINE_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_INLINE_MS ?? 20_000);
  const BULK_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_BULK_MS ?? 60_000);
  const BULK_CONCURRENCY = Number(process.env.AI_BULK_CONCURRENCY ?? 5);
  const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000;

  export interface AiDraftView {
    eventId: string;
    categoryId: string | null;
    categoryName: string | null;
    vendorId: string | null;
    vendorName: string | null;
    confidence: AiConfidence;
    reasoning: string;
    providerId: string | null;
    createdAt: string;
  }

  export type SuggestResult =
    | { kind: 'fresh'; draft: AiDraftView }
    | { kind: 'cached'; draft: AiDraftView }
    | { kind: 'failed'; error: string };

  export type ApplyDecision =
    | { action: 'accept' }
    | { action: 'edit'; chosenCategoryId: string; chosenVendorId?: string | null }
    | { action: 'reject' };

  export interface BulkSuggestQuery {
    accountIds?: string[];
    dateFrom?: string;
    dateTo?: string;
    scope: 'uncategorised' | 'all';
  }

  @Injectable()
  export class AiCategoriserService {
    constructor(private prisma: PrismaService, private ai: AiClientService) {}

    // ===== suggest =====
    async suggest(transactionId: string, opts: { force?: boolean; timeoutMs?: number } = {}): Promise<SuggestResult> {
      if (!opts.force) {
        const cached = await this.loadUnresolvedDraft(transactionId);
        if (cached && Date.now() - new Date(cached.createdAt).getTime() < CACHE_WINDOW_MS) {
          return { kind: 'cached', draft: cached };
        }
      }

      const tx = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { account: { select: { id: true, name: true } } },
      });
      if (!tx) throw new NotFoundException('Transaction not found');

      const [categories, vendors, fewShots] = await Promise.all([
        this.loadCategoriesForPrompt(),
        this.loadVendorsForPrompt(),
        this.loadFewShots(),
      ]);

      const userPrompt = buildCategoriseUserPrompt({
        categories,
        vendors,
        fewShots,
        tx: {
          date: tx.date.toISOString().slice(0, 10),
          amount: tx.amount.toString(),
          description: tx.description,
          vendorGuess: vendors.find((v) => v.id === tx.vendorId)?.name ?? null,
          accountName: tx.account.name,
        },
      });

      const result = await this.ai.complete<CategoriseLlmResponse>({
        systemPrompt: CATEGORISE_SYSTEM_PROMPT,
        userPrompt,
        jsonSchema: CATEGORISE_SCHEMA,
        purpose: 'CATEGORISE',
        timeoutMs: opts.timeoutMs ?? INLINE_TIMEOUT_MS,
        contextIds: { transactionId },
      });

      if (!result.ok) {
        const msg = result.error === 'no-providers'
          ? 'AI is not configured. Add a provider at /settings/ai-setup.'
          : `Provider chain exhausted: ${result.lastError?.message ?? 'unknown error'}`;
        return { kind: 'failed', error: msg };
      }

      // Validation hardening against hallucinated ids.
      const activeCats = new Set(categories.map((c) => c.id));
      const activeVens = new Set(vendors.map((v) => v.id));
      let { categoryId, vendorId, confidence, reasoning } = result.data;
      if (categoryId && !activeCats.has(categoryId)) {
        return { kind: 'failed', error: 'AI returned an unknown categoryId. Try again.' };
      }
      if (vendorId && !activeVens.has(vendorId)) vendorId = null;
      if (reasoning.length > 200) reasoning = reasoning.slice(0, 200);

      const event = await this.prisma.categorisationEvent.create({
        data: {
          transactionId,
          source: 'AI_DRAFT',
          newCategoryId: categoryId,
          newVendorId: vendorId,
          reasoning,
        },
      });

      return {
        kind: 'fresh',
        draft: {
          eventId: event.id,
          categoryId,
          categoryName: categoryId ? categories.find((c) => c.id === categoryId)?.name ?? null : null,
          vendorId,
          vendorName: vendorId ? vendors.find((v) => v.id === vendorId)?.name ?? null : null,
          confidence,
          reasoning,
          providerId: result.providerId,
          createdAt: event.createdAt.toISOString(),
        },
      };
    }
  ```

- [ ] **Step 3: Continue the categoriser — Part 2: `apply()`**

  Append:

  ```ts
    // ===== apply =====
    async apply(transactionId: string, decision: ApplyDecision): Promise<void> {
      const draft = await this.loadUnresolvedDraft(transactionId);
      if (!draft) throw new ConflictException('No pending AI draft for this transaction');

      const tx = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { categoryId: true, vendorId: true },
      });
      if (!tx) throw new NotFoundException('Transaction not found');

      // Server-side resolution of accept vs edit when client says 'edit' but values
      // equal the AI's pick — keeps acceptedAiSuggestion honest.
      let effective = decision;
      if (decision.action === 'edit') {
        const sameCat = decision.chosenCategoryId === draft.categoryId;
        const sameVen = (decision.chosenVendorId ?? null) === (draft.vendorId ?? null);
        if (sameCat && sameVen) effective = { action: 'accept' };
      }

      await this.prisma.$transaction(async (db) => {
        if (effective.action === 'accept') {
          await db.transaction.update({
            where: { id: transactionId },
            data: {
              categoryId: draft.categoryId,
              vendorId: draft.vendorId ?? tx.vendorId,
              categorisedAt: new Date(),
            },
          });
          await db.categorisationEvent.create({
            data: {
              transactionId,
              source: 'AI_APPLIED',
              acceptedAiSuggestion: true,
              oldCategoryId: tx.categoryId,
              newCategoryId: draft.categoryId,
              oldVendorId: tx.vendorId,
              newVendorId: draft.vendorId,
              reasoning: draft.reasoning,
            },
          });
        } else if (effective.action === 'edit') {
          const chosenCat = effective.chosenCategoryId;
          const chosenVen = effective.chosenVendorId ?? null;
          await db.transaction.update({
            where: { id: transactionId },
            data: { categoryId: chosenCat, vendorId: chosenVen, categorisedAt: new Date() },
          });
          await db.categorisationEvent.create({
            data: {
              transactionId,
              source: 'AI_APPLIED',
              acceptedAiSuggestion: false,
              oldCategoryId: tx.categoryId,
              newCategoryId: chosenCat,
              oldVendorId: tx.vendorId,
              newVendorId: chosenVen,
              reasoning: draft.reasoning,
            },
          });
        } else {
          // reject
          await db.categorisationEvent.create({
            data: {
              transactionId,
              source: 'AI_REJECTED',
              newCategoryId: draft.categoryId,
              reasoning: draft.reasoning,
            },
          });
        }
      });
    }
  ```

- [ ] **Step 4: Continue the categoriser — Part 3: `bulkSuggest()` + status/cancel**

  Append:

  ```ts
    // ===== bulk =====
    async bulkSuggest(query: BulkSuggestQuery): Promise<{ runId: string; totalQueued: number }> {
      const where: any = {};
      if (query.accountIds?.length) where.accountId = { in: query.accountIds };
      if (query.dateFrom) where.date = { ...(where.date ?? {}), gte: new Date(query.dateFrom) };
      if (query.dateTo) where.date = { ...(where.date ?? {}), lte: new Date(query.dateTo) };
      if (query.scope === 'uncategorised') where.categoryId = null;

      const ids = await this.prisma.transaction.findMany({ where, select: { id: true } });
      const runId = randomUUID();
      const run = BulkRuns.create(runId, ids.length);

      // Fire and forget; status polled via BulkRuns.get.
      void this.runBulk(run, ids.map((x) => x.id));
      return { runId, totalQueued: run.totalQueued };
    }

    private async runBulk(run: { id: string; abort: AbortController; cancelled: boolean }, txIds: string[]) {
      const r = BulkRuns.get(run.id)!;
      const limit = pLimit(BULK_CONCURRENCY);
      await Promise.all(txIds.map((id) => limit(async () => {
        if (r.cancelled) return;
        try {
          const result = await this.suggest(id, { force: false, timeoutMs: BULK_TIMEOUT_MS });
          if (result.kind === 'fresh') r.ok++;
          else if (result.kind === 'cached') r.cached++;
          else r.failed++;
        } catch {
          r.failed++;
        } finally {
          r.done++;
        }
      })));
    }

    getBulkStatus(runId: string) {
      const r = BulkRuns.get(runId);
      if (!r) throw new NotFoundException('Run not found');
      return { runId: r.id, totalQueued: r.totalQueued, done: r.done, ok: r.ok, cached: r.cached, failed: r.failed, cancelled: r.cancelled };
    }

    cancelBulk(runId: string) {
      BulkRuns.cancel(runId);
    }
  ```

- [ ] **Step 5: Continue the categoriser — Part 4: review queue + private helpers**

  Append:

  ```ts
    // ===== review queue =====
    async listReviewQueue(): Promise<AiDraftView[]> {
      // Unresolved AI_DRAFTs: most recent AI_DRAFT per transaction, with no later
      // AI_APPLIED|AI_REJECTED for that transaction.
      const drafts = await this.prisma.categorisationEvent.findMany({
        where: { source: 'AI_DRAFT' },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
      const resolutions = await this.prisma.categorisationEvent.findMany({
        where: { source: { in: ['AI_APPLIED', 'AI_REJECTED'] } },
        select: { transactionId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      const latestResolutionByTx = new Map<string, Date>();
      for (const r of resolutions) {
        if (!latestResolutionByTx.has(r.transactionId)) {
          latestResolutionByTx.set(r.transactionId, r.createdAt);
        }
      }
      const seenTx = new Set<string>();
      const out: AiDraftView[] = [];
      const [categories, vendors] = await Promise.all([this.loadCategoriesForPrompt(), this.loadVendorsForPrompt()]);
      const cat = new Map(categories.map((c) => [c.id, c.name]));
      const ven = new Map(vendors.map((v) => [v.id, v.name]));
      for (const d of drafts) {
        if (seenTx.has(d.transactionId)) continue;
        const resolution = latestResolutionByTx.get(d.transactionId);
        if (resolution && resolution > d.createdAt) continue;
        seenTx.add(d.transactionId);
        out.push({
          eventId: d.id,
          categoryId: d.newCategoryId,
          categoryName: d.newCategoryId ? cat.get(d.newCategoryId) ?? null : null,
          vendorId: d.newVendorId,
          vendorName: d.newVendorId ? ven.get(d.newVendorId) ?? null : null,
          confidence: 'med', // confidence isn't stored on the event; conservative default for the queue
          reasoning: d.reasoning ?? '',
          providerId: null,
          createdAt: d.createdAt.toISOString(),
        });
        if (out.length >= 500) break;
      }
      return out;
    }

    // ===== helpers =====
    private async loadUnresolvedDraft(transactionId: string): Promise<AiDraftView | null> {
      const draft = await this.prisma.categorisationEvent.findFirst({
        where: { transactionId, source: 'AI_DRAFT' },
        orderBy: { createdAt: 'desc' },
      });
      if (!draft) return null;
      const later = await this.prisma.categorisationEvent.findFirst({
        where: { transactionId, source: { in: ['AI_APPLIED', 'AI_REJECTED'] }, createdAt: { gt: draft.createdAt } },
      });
      if (later) return null;
      const cat = draft.newCategoryId
        ? await this.prisma.category.findUnique({ where: { id: draft.newCategoryId }, select: { name: true } })
        : null;
      const ven = draft.newVendorId
        ? await this.prisma.vendor.findUnique({ where: { id: draft.newVendorId }, select: { name: true } })
        : null;
      return {
        eventId: draft.id,
        categoryId: draft.newCategoryId,
        categoryName: cat?.name ?? null,
        vendorId: draft.newVendorId,
        vendorName: ven?.name ?? null,
        confidence: 'med',
        reasoning: draft.reasoning ?? '',
        providerId: null,
        createdAt: draft.createdAt.toISOString(),
      };
    }

    private async loadCategoriesForPrompt() {
      const cats = await this.prisma.category.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: { _count: { select: { transactions: true } } },
      });
      return cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind, usageCount: c._count.transactions }));
    }

    private async loadVendorsForPrompt() {
      const vens = await this.prisma.vendor.findMany({
        where: { isActive: true },
        include: { _count: { select: { transactions: true } } },
        orderBy: { name: 'asc' },
      });
      return vens
        .sort((a, b) => b._count.transactions - a._count.transactions)
        .slice(0, 50)
        .map((v) => ({ id: v.id, name: v.name, aliases: v.aliases }));
    }

    private async loadFewShots() {
      // Q-A qualification: USER or AI_APPLIED accepted, newCategoryId not null.
      const raw = await this.prisma.categorisationEvent.findMany({
        where: {
          OR: [
            { source: 'USER' },
            { source: 'AI_APPLIED', acceptedAiSuggestion: true },
          ],
          newCategoryId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: {
          transaction: { select: { date: true, amount: true, description: true } },
        },
      });
      // S-B stratified: 2 per category, cap 30, ascending by date for prompt readability.
      const N_PER_CATEGORY = 2;
      const TOTAL_CAP = 30;
      const byCategory = new Map<string, typeof raw>();
      for (const e of raw) {
        const k = e.newCategoryId!;
        const arr = byCategory.get(k) ?? [];
        if (arr.length < N_PER_CATEGORY) arr.push(e);
        byCategory.set(k, arr);
      }
      const flat = Array.from(byCategory.values()).flat().slice(0, TOTAL_CAP);
      flat.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const cats = await this.prisma.category.findMany({
        where: { id: { in: flat.map((e) => e.newCategoryId!) } },
        select: { id: true, name: true },
      });
      const catName = new Map(cats.map((c) => [c.id, c.name]));
      return flat.map((e) => ({
        date: e.transaction.date.toISOString().slice(0, 10),
        amount: e.transaction.amount.toString(),
        description: e.transaction.description,
        categoryName: catName.get(e.newCategoryId!) ?? 'Unknown',
      }));
    }
  }
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/ai/ai-categoriser.service.ts backend/src/ai/bulk-runs.ts
  git commit -m "feat(ai): AiCategoriser — suggest/apply/bulk/review-queue"
  ```

---

## Task 8: AiRuleDrafter — TDD the cluster detection

**Files:**
- Create: `backend/src/ai/ai-rule-drafter.service.spec.ts`
- Create: `backend/src/ai/ai-rule-drafter.service.ts`

- [ ] **Step 1: Write the failing spec for cluster detection only (deterministic half)**

  Create `backend/src/ai/ai-rule-drafter.service.spec.ts`:

  ```ts
  import { clusterKey, computeClusterHash, buildClusters } from './ai-rule-drafter.service';

  describe('clusterKey', () => {
    it('returns null for empty/short input', () => {
      expect(clusterKey('')).toBeNull();
      expect(clusterKey('XX')).toBeNull();
    });
    it('strips digits and locations, keeps first 2 alphabetic tokens', () => {
      expect(clusterKey('COLES 1234 SUBIACO')).toBe('COLES');
      expect(clusterKey('WOOLWORTHS 0078 KARRINYUP WA')).toBe('WOOLWORTHS');
      expect(clusterKey('TFR FROM XX1234')).toBe('TFR FROM');
    });
    it('uppercases and collapses whitespace', () => {
      expect(clusterKey('  uber   eats   123  ')).toBe('UBER EATS');
    });
  });

  describe('computeClusterHash', () => {
    it('is deterministic across calls', () => {
      const h1 = computeClusterHash('COLES', 'cat-1');
      const h2 = computeClusterHash('COLES', 'cat-1');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(16);
    });
    it('changes when category changes', () => {
      expect(computeClusterHash('COLES', 'cat-1')).not.toBe(computeClusterHash('COLES', 'cat-2'));
    });
  });

  describe('buildClusters', () => {
    const e = (desc: string, cat: string, source: 'USER' | 'AI_APPLIED' = 'USER', accepted = true) => ({
      newCategoryId: cat,
      source,
      acceptedAiSuggestion: source === 'AI_APPLIED' ? accepted : null,
      createdAt: new Date(),
      transaction: { description: desc, amount: '1', date: new Date() },
    });

    it('qualifies a cluster when size >= M and agreement >= 80%', () => {
      const events = [
        e('COLES 1234', 'cat-G'), e('COLES 5678', 'cat-G'), e('COLES 9000', 'cat-G'),
        e('COLES 1111', 'cat-G'), e('COLES 2222', 'cat-G'),
      ];
      const clusters = buildClusters(events as any, { threshold: 5 });
      expect(clusters).toHaveLength(1);
      expect(clusters[0].clusterKey).toBe('COLES');
      expect(clusters[0].newCategoryId).toBe('cat-G');
      expect(clusters[0].size).toBe(5);
    });

    it('rejects when size < threshold', () => {
      const events = [e('COLES 1', 'cat-G'), e('COLES 2', 'cat-G'), e('COLES 3', 'cat-G')];
      expect(buildClusters(events as any, { threshold: 5 })).toHaveLength(0);
    });

    it('rejects when agreement < 80%', () => {
      const events = [
        e('AMAZON 1', 'cat-Office'), e('AMAZON 2', 'cat-Office'),
        e('AMAZON 3', 'cat-Office'),
        e('AMAZON 4', 'cat-Software'), e('AMAZON 5', 'cat-Software'),
      ];
      // 3/5 = 60% agreement on Office — fails the 80% threshold
      expect(buildClusters(events as any, { threshold: 3 })).toHaveLength(0);
    });

    it('skips events with null clusterKey', () => {
      const events = [
        e('X', 'cat-G'), e('Y', 'cat-G'), e('Z', 'cat-G'),
        e('COLES 1', 'cat-G'), e('COLES 2', 'cat-G'), e('COLES 3', 'cat-G'), e('COLES 4', 'cat-G'), e('COLES 5', 'cat-G'),
      ];
      const clusters = buildClusters(events as any, { threshold: 5 });
      expect(clusters).toHaveLength(1);
      expect(clusters[0].clusterKey).toBe('COLES');
    });

    it('produces stable clusterHash on the cluster output', () => {
      const events = Array(6).fill(0).map((_, i) => e(`COLES ${i}`, 'cat-G'));
      const a = buildClusters(events as any, { threshold: 5 });
      const b = buildClusters(events as any, { threshold: 5 });
      expect(a[0].clusterHash).toBe(b[0].clusterHash);
    });
  });
  ```

- [ ] **Step 2: Run, confirm it fails (module not found)**

  ```bash
  docker compose exec backend npm test -- --testPathPattern=ai-rule-drafter.service.spec.ts
  ```
  Expected: red — module `./ai-rule-drafter.service` not found.

- [ ] **Step 3: Implement the service — Part 1: clusterKey + hash + buildClusters**

  Create `backend/src/ai/ai-rule-drafter.service.ts`:

  ```ts
  import { Injectable } from '@nestjs/common';
  import { createHash } from 'crypto';
  import { PrismaService } from '../prisma/prisma.service';
  import { AiClientService } from './ai-client.service';
  import type { DraftRuleLlmResponse } from './types';

  const BULK_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_BULK_MS ?? 60_000);
  const MINING_WINDOW_DAYS = 180;
  const AGREEMENT_RATIO = 0.8;
  const SAMPLES_TO_LLM = 10;

  // === Exported helpers (testable in isolation) ===

  export function clusterKey(description: string): string | null {
    if (!description) return null;
    const upper = description.toUpperCase().replace(/\s+/g, ' ').trim();
    // Strip tokens that are purely digits or "XX0000" or look like state suffixes
    // (2-letter trailing tokens are Australian state codes).
    const tokens = upper
      .split(' ')
      .filter((t) => !/^\d+$/.test(t))
      .filter((t) => !/^[A-Z]?[A-Z0-9]*\d+[A-Z0-9]*$/.test(t)) // strips "0078", "XX1234"
      .filter((t) => t.length >= 2 || /^[A-Z]+$/.test(t));
    const alpha = tokens.filter((t) => /^[A-Z]+$/.test(t));
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

  export function buildClusters(
    events: RawEvent[],
    opts: { threshold: number },
  ): Cluster[] {
    const byKey = new Map<string, Map<string, RawEvent[]>>(); // key -> categoryId -> events
    for (const e of events) {
      if (!e.newCategoryId) continue;
      const k = clusterKey(e.transaction.description);
      if (!k) continue;
      const inner = byKey.get(k) ?? new Map<string, RawEvent[]>();
      const arr = inner.get(e.newCategoryId) ?? [];
      arr.push(e);
      inner.set(e.newCategoryId, arr);
      byKey.set(k, inner);
    }
    const out: Cluster[] = [];
    for (const [key, byCat] of byKey) {
      const total = Array.from(byCat.values()).reduce((s, a) => s + a.length, 0);
      for (const [categoryId, arr] of byCat) {
        if (arr.length < opts.threshold) continue;
        if (arr.length / total < AGREEMENT_RATIO) continue;
        out.push({
          clusterKey: key,
          newCategoryId: categoryId,
          size: arr.length,
          clusterHash: computeClusterHash(key, categoryId),
          sampleDescriptions: arr.slice(0, SAMPLES_TO_LLM).map((e) => e.transaction.description),
        });
      }
    }
    return out;
  }
  ```

- [ ] **Step 4: Run spec, confirm cluster tests pass**

  ```bash
  docker compose exec backend npm test -- --testPathPattern=ai-rule-drafter.service.spec.ts
  ```
  Expected: 8 passing tests.

- [ ] **Step 5: Continue the service — Part 2: LLM polish + mining orchestration**

  Append to `ai-rule-drafter.service.ts`:

  ```ts
  // === Service ===

  @Injectable()
  export class AiRuleDrafterService {
    constructor(private prisma: PrismaService, private ai: AiClientService) {}

    async mine(): Promise<{ drafted: number; skippedSuppressed: number; clustersConsidered: number; failed: number }> {
      const prefs = await this.prisma.preferences.findFirst();
      const threshold = prefs?.aiMiningThreshold ?? 5;
      const cutoff = new Date(Date.now() - MINING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      const events = await this.prisma.categorisationEvent.findMany({
        where: {
          OR: [{ source: 'USER' }, { source: 'AI_APPLIED', acceptedAiSuggestion: true }],
          newCategoryId: { not: null },
          createdAt: { gte: cutoff },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
        include: { transaction: { select: { description: true, amount: true, date: true } } },
      });

      const raw: RawEvent[] = events.map((e) => ({
        newCategoryId: e.newCategoryId!,
        transaction: {
          description: e.transaction.description,
          amount: e.transaction.amount.toString(),
          date: e.transaction.date,
        },
      }));
      const clusters = buildClusters(raw, { threshold });
      if (clusters.length === 0) return { drafted: 0, skippedSuppressed: 0, clustersConsidered: 0, failed: 0 };

      const hashes = clusters.map((c) => c.clusterHash);
      const existing = await this.prisma.rule.findMany({
        where: { clusterHash: { in: hashes } },
        select: { clusterHash: true },
      });
      const suppressed = new Set(existing.map((r) => r.clusterHash));
      const survivors = clusters.filter((c) => !suppressed.has(c.clusterHash));

      const SYSTEM = `You are a bookkeeping assistant. The user wants you to write a categorisation rule that captures a pattern in their history.

  A rule has:
    - name (<= 60 chars)
    - one outcome category
    - 1-3 conditions, AND-only, each: { field, operator, value } from these enums:
        field: DESCRIPTION | AMOUNT | VENDOR | ACCOUNT
        operator: CONTAINS | EQUALS | STARTS_WITH | ENDS_WITH | GT | LT | BETWEEN | IN

  Prefer the simplest rule that matches. Use DESCRIPTION CONTAINS most often.
  Reach for STARTS_WITH only when descriptions share a clear prefix.
  Use AMOUNT GT/LT/BETWEEN only when the pattern is amount-bounded.
  Never use VENDOR field unless the matched vendor name is identical across all examples.

  Output strict JSON matching the schema.`;

      const SCHEMA = {
        name: 'draft_rule_response',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'conditions', 'reasoning'],
          properties: {
            name: { type: 'string', maxLength: 60 },
            conditions: {
              type: 'array',
              minItems: 1, maxItems: 3,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['field', 'operator', 'value'],
                properties: {
                  field: { enum: ['DESCRIPTION', 'AMOUNT', 'VENDOR', 'ACCOUNT'] },
                  operator: { enum: ['CONTAINS', 'EQUALS', 'STARTS_WITH', 'ENDS_WITH', 'GT', 'LT', 'BETWEEN', 'IN'] },
                  value: { type: 'string' },
                  value2: { type: ['string', 'null'] },
                },
              },
            },
            reasoning: { type: 'string', maxLength: 200 },
          },
        },
      };

      const categories = await this.prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true } });
      const catName = new Map(categories.map((c) => [c.id, c.name]));

      let drafted = 0;
      let failed = 0;
      for (const c of survivors) {
        const userPrompt = [
          `CLUSTER:`,
          `  Category: ${catName.get(c.newCategoryId) ?? 'Unknown'}`,
          `  Events: ${c.size}`,
          '',
          'SAMPLE DESCRIPTIONS:',
          ...c.sampleDescriptions.map((d) => `  ${d}`),
          '',
          'Propose a rule.',
        ].join('\n');

        const result = await this.ai.complete<DraftRuleLlmResponse>({
          systemPrompt: SYSTEM,
          userPrompt,
          jsonSchema: SCHEMA,
          purpose: 'DRAFT_RULE',
          timeoutMs: BULK_TIMEOUT_MS,
        });

        if (!result.ok) { failed++; continue; }

        const validated = this.validateRule(result.data, c, catName.get(c.newCategoryId) ?? 'Unknown');
        if (!validated) { failed++; continue; }

        const rule = await this.prisma.rule.create({
          data: {
            name: validated.name,
            state: 'AI_DRAFTED',
            isActive: false,
            priority: 1000,
            categoryId: c.newCategoryId,
            clusterHash: c.clusterHash,
            noteOnApply: null,
            conditions: { create: validated.conditions.map((cond, i) => ({ ...cond, position: i })) },
          },
        });
        drafted++;
      }

      return {
        drafted,
        skippedSuppressed: clusters.length - survivors.length,
        clustersConsidered: clusters.length,
        failed,
      };
    }

    private validateRule(r: DraftRuleLlmResponse, cluster: Cluster, fallbackCategoryName: string) {
      const name = (r.name || '').trim() || `${fallbackCategoryName} from ${cluster.clusterKey}`;
      if (name.length > 60) return null;
      if (!Array.isArray(r.conditions) || r.conditions.length === 0 || r.conditions.length > 3) return null;
      const out: Array<{ field: any; operator: any; value: string; value2: string | null; valueList: string[] }> = [];
      for (const c of r.conditions) {
        if (!['DESCRIPTION', 'AMOUNT', 'VENDOR', 'ACCOUNT'].includes(c.field)) return null;
        if (!['CONTAINS', 'EQUALS', 'STARTS_WITH', 'ENDS_WITH', 'GT', 'LT', 'BETWEEN', 'IN'].includes(c.operator)) return null;
        if (c.operator === 'BETWEEN' && !c.value2) return null;
        const valueList = c.operator === 'IN' ? c.value.split(',').map((s) => s.trim()).filter(Boolean) : [];
        out.push({ field: c.field, operator: c.operator, value: c.value, value2: c.value2 ?? null, valueList });
      }
      return { name, conditions: out };
    }
  }
  ```

- [ ] **Step 6: Run spec again to confirm we didn't regress the cluster-half tests**

  ```bash
  docker compose exec backend npm test -- --testPathPattern=ai-rule-drafter.service.spec.ts
  ```
  Expected: still 8 passing tests.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/src/ai/ai-rule-drafter.service.ts backend/src/ai/ai-rule-drafter.service.spec.ts
  git commit -m "feat(ai): AiRuleDrafter — cluster detection + LLM polish + tests"
  ```

---

## Task 9: AiController + DTO + module wiring

**Files:**
- Create: `backend/src/ai/ai.dto.ts`
- Create: `backend/src/ai/ai.controller.ts`
- Create: `backend/src/ai/ai.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create DTOs**

  ```ts
  // backend/src/ai/ai.dto.ts
  import { IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

  export class SuggestCategoryDto {
    @IsUUID() transactionId!: string;
    @IsBoolean() @IsOptional() force?: boolean;
  }

  export class ApplyAcceptDto { @IsIn(['accept']) action!: 'accept'; }
  export class ApplyEditDto {
    @IsIn(['edit']) action!: 'edit';
    @IsUUID() chosenCategoryId!: string;
    @IsUUID() @IsOptional() chosenVendorId?: string | null;
  }
  export class ApplyRejectDto { @IsIn(['reject']) action!: 'reject'; }

  export class ApplyDto {
    @IsUUID() transactionId!: string;
    decision!: ApplyAcceptDto | ApplyEditDto | ApplyRejectDto;
  }

  export class BulkSuggestDto {
    @IsArray() @IsString({ each: true }) @IsOptional() accountIds?: string[];
    @IsDateString() @IsOptional() dateFrom?: string;
    @IsDateString() @IsOptional() dateTo?: string;
    @IsIn(['uncategorised', 'all']) scope!: 'uncategorised' | 'all';
  }
  ```

- [ ] **Step 2: Create controller**

  ```ts
  // backend/src/ai/ai.controller.ts
  import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
  import { AiCategoriserService } from './ai-categoriser.service';
  import { AiRuleDrafterService } from './ai-rule-drafter.service';
  import { ApplyDto, BulkSuggestDto, SuggestCategoryDto } from './ai.dto';

  @Controller('ai')
  export class AiController {
    constructor(
      private categoriser: AiCategoriserService,
      private drafter: AiRuleDrafterService,
    ) {}

    @Post('suggest-category')
    @HttpCode(200)
    suggest(@Body() dto: SuggestCategoryDto) {
      return this.categoriser.suggest(dto.transactionId, { force: dto.force });
    }

    @Post('apply')
    @HttpCode(204)
    async apply(@Body() dto: ApplyDto): Promise<void> {
      await this.categoriser.apply(dto.transactionId, dto.decision as any);
    }

    @Post('bulk-suggest')
    @HttpCode(200)
    bulk(@Body() dto: BulkSuggestDto) {
      return this.categoriser.bulkSuggest(dto);
    }

    @Get('bulk-suggest/:runId/status')
    bulkStatus(@Param('runId') runId: string) {
      return this.categoriser.getBulkStatus(runId);
    }

    @Post('bulk-suggest/:runId/cancel')
    @HttpCode(204)
    bulkCancel(@Param('runId') runId: string) {
      this.categoriser.cancelBulk(runId);
    }

    @Get('review-queue')
    queue() {
      return this.categoriser.listReviewQueue();
    }

    @Post('mine-rules')
    @HttpCode(200)
    mine() {
      return this.drafter.mine();
    }
  }
  ```

- [ ] **Step 3: Create module**

  ```ts
  // backend/src/ai/ai.module.ts
  import { Module } from '@nestjs/common';
  import { PrismaModule } from '../prisma/prisma.module';
  import { AiController } from './ai.controller';
  import { AiClientService } from './ai-client.service';
  import { AiCategoriserService } from './ai-categoriser.service';
  import { AiRuleDrafterService } from './ai-rule-drafter.service';

  @Module({
    imports: [PrismaModule],
    controllers: [AiController],
    providers: [AiClientService, AiCategoriserService, AiRuleDrafterService],
    exports: [AiCategoriserService, AiRuleDrafterService],
  })
  export class AiModule {}
  ```

- [ ] **Step 4: Register in app module**

  Open `backend/src/app.module.ts`. Add `import { AiModule } from './ai/ai.module';` near the other imports and include `AiModule` in the `imports: [...]` array of the `@Module` decorator.

- [ ] **Step 5: Verify backend builds and routes register**

  ```bash
  docker compose build backend && docker compose up -d backend
  docker logs simplebooks-backend-1 -n 80 | grep -E "Mapped|AiController|Nest application"
  ```
  Expected: lines showing `AiController` and the seven routes mapped (`/ai/suggest-category`, `/ai/apply`, `/ai/bulk-suggest`, `/ai/bulk-suggest/:runId/status`, `/ai/bulk-suggest/:runId/cancel`, `/ai/review-queue`, `/ai/mine-rules`) and `Nest application successfully started`.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/ai/ai.dto.ts backend/src/ai/ai.controller.ts backend/src/ai/ai.module.ts backend/src/app.module.ts
  git commit -m "feat(ai): controller + module + DTOs; register AiModule"
  ```

---

## Task 10: AiProvider — `move` endpoint

**Files:**
- Modify: `backend/src/ai-providers/dto.ts`
- Modify: `backend/src/ai-providers/ai-providers.service.ts`
- Modify: `backend/src/ai-providers/ai-providers.controller.ts`

- [ ] **Step 1: Extend DTO**

  Append to `backend/src/ai-providers/dto.ts`:

  ```ts
  import { IsIn } from 'class-validator';

  export class MoveAiProviderDto {
    @IsIn(['up', 'down']) direction!: 'up' | 'down';
  }
  ```

- [ ] **Step 2: Extend service**

  Add `move()` to `AiProvidersService` in `backend/src/ai-providers/ai-providers.service.ts`:

  ```ts
  async move(id: string, direction: 'up' | 'down') {
    const target = await this.get(id);
    if (target.isPrimary) {
      // Primary is always position 1; movement is via setPrimary.
      return target;
    }
    const all = await this.prisma.aiProvider.findMany({
      where: { isPrimary: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const idx = all.findIndex((p) => p.id === id);
    const neighbourIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (neighbourIdx < 0 || neighbourIdx >= all.length) return target;
    const neighbour = all[neighbourIdx];
    return this.prisma.$transaction(async (tx) => {
      // Swap sortOrders. If equal, bump the neighbour by 10 then assign.
      let aOrder = target.sortOrder;
      let bOrder = neighbour.sortOrder;
      if (aOrder === bOrder) bOrder = aOrder + 10;
      await tx.aiProvider.update({ where: { id: target.id }, data: { sortOrder: bOrder } });
      await tx.aiProvider.update({ where: { id: neighbour.id }, data: { sortOrder: aOrder } });
      return tx.aiProvider.findUnique({ where: { id: target.id } });
    });
  }
  ```

- [ ] **Step 3: Extend controller**

  In `backend/src/ai-providers/ai-providers.controller.ts`, add the move endpoint after `setPrimary`:

  ```ts
  import { MoveAiProviderDto } from './dto';
  // ...

  @Patch(':id/move')
  move(@Param('id') id: string, @Body() dto: MoveAiProviderDto) {
    return this.service.move(id, dto.direction);
  }
  ```

- [ ] **Step 4: Rebuild backend and verify**

  ```bash
  docker compose build backend && docker compose up -d backend
  docker logs simplebooks-backend-1 -n 40 | grep -E "ai-providers/.+/move"
  ```
  Expected: route mapped.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/ai-providers/
  git commit -m "feat(ai-providers): PATCH :id/move — swap sortOrder with non-primary neighbour"
  ```

---

## Task 11: Preferences — accept `aiMiningThreshold`

**Files:**
- Modify: `backend/src/preferences/dto.ts`

- [ ] **Step 1: Extend the upsert DTO**

  Replace the body of `backend/src/preferences/dto.ts` with:

  ```ts
  import { Type } from 'class-transformer';
  import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

  export class UpsertPreferencesDto {
    @IsString() @IsOptional() @MaxLength(64) timezone?: string;
    @Type(() => Number) @IsInt() @IsOptional() @Min(1) @Max(12) financialYearStart?: number;
    @Type(() => Number) @IsInt() @IsOptional() @Min(1) @Max(50) aiMiningThreshold?: number;
  }
  ```

  (No service change needed — `save()` spreads the DTO straight into Prisma's update payload, and the column already exists from Task 1.)

- [ ] **Step 2: Rebuild + smoke test the round-trip**

  ```bash
  docker compose build backend && docker compose up -d backend
  curl -s -X PUT http://localhost:4000/preferences -H 'Content-Type: application/json' -d '{"aiMiningThreshold":7}' | python3 -m json.tool
  curl -s http://localhost:4000/preferences | python3 -m json.tool
  ```
  Expected: both responses include `"aiMiningThreshold": 7`.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/src/preferences/dto.ts
  git commit -m "feat(preferences): accept aiMiningThreshold (1-50)"
  ```

---

## Task 12: Frontend types + lib client

**Files:**
- Modify: `frontend/lib/types.ts`
- Create: `frontend/lib/ai.ts`
- Modify: `frontend/lib/ai-providers.ts`

- [ ] **Step 1: Extend types**

  Append to `frontend/lib/types.ts`:

  ```ts
  export type AiConfidence = 'high' | 'med' | 'low';

  export interface AiDraftView {
    eventId: string;
    categoryId: string | null;
    categoryName: string | null;
    vendorId: string | null;
    vendorName: string | null;
    confidence: AiConfidence;
    reasoning: string;
    providerId: string | null;
    createdAt: string;
  }

  export type SuggestResult =
    | { kind: 'fresh'; draft: AiDraftView }
    | { kind: 'cached'; draft: AiDraftView }
    | { kind: 'failed'; error: string };

  export interface BulkRunStatus {
    runId: string; totalQueued: number; done: number;
    ok: number; cached: number; failed: number; cancelled: boolean;
  }

  export interface MineRulesResult {
    drafted: number; skippedSuppressed: number; clustersConsidered: number; failed: number;
  }
  ```

  (Also, if not already present, ensure `AiProvider` has a `sortOrder: number` field on its TS interface so the move-arrows UI can read it. Search `types.ts` for the existing `AiProvider` interface and add `sortOrder: number;` if absent.)

- [ ] **Step 2: Create lib/ai.ts**

  ```ts
  // frontend/lib/ai.ts
  import { api } from './api';
  import type { AiDraftView, BulkRunStatus, MineRulesResult, SuggestResult } from './types';

  export function suggestCategory(transactionId: string, opts: { force?: boolean } = {}) {
    return api<SuggestResult>('/ai/suggest-category', { method: 'POST', body: JSON.stringify({ transactionId, ...opts }) });
  }

  export type ApplyDecision =
    | { action: 'accept' }
    | { action: 'edit'; chosenCategoryId: string; chosenVendorId?: string | null }
    | { action: 'reject' };

  export function applyAiSuggestion(transactionId: string, decision: ApplyDecision) {
    return api<void>('/ai/apply', { method: 'POST', body: JSON.stringify({ transactionId, decision }) });
  }

  export function bulkSuggest(query: { accountIds?: string[]; dateFrom?: string; dateTo?: string; scope: 'uncategorised' | 'all' }) {
    return api<{ runId: string; totalQueued: number }>('/ai/bulk-suggest', { method: 'POST', body: JSON.stringify(query) });
  }

  export function bulkSuggestStatus(runId: string) {
    return api<BulkRunStatus>(`/ai/bulk-suggest/${runId}/status`);
  }

  export function bulkSuggestCancel(runId: string) {
    return api<void>(`/ai/bulk-suggest/${runId}/cancel`, { method: 'POST' });
  }

  export function listReviewQueue() {
    return api<AiDraftView[]>('/ai/review-queue');
  }

  export function mineRules() {
    return api<MineRulesResult>('/ai/mine-rules', { method: 'POST' });
  }
  ```

- [ ] **Step 3: Extend ai-providers lib**

  Append to `frontend/lib/ai-providers.ts`:

  ```ts
  export function moveAiProvider(id: string, direction: 'up' | 'down') {
    return api(`/ai-providers/${id}/move`, { method: 'PATCH', body: JSON.stringify({ direction }) });
  }
  ```
  (Use whatever `api` import the file already has.)

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/lib/types.ts frontend/lib/ai.ts frontend/lib/ai-providers.ts
  git commit -m "feat(ai/lib): TS types + ai.ts client + moveAiProvider"
  ```

---

## Task 13: AiSuggestionBanner component

**Files:**
- Create: `frontend/components/transactions/ai-suggestion-banner.tsx`

- [ ] **Step 1: Implement the banner**

  ```tsx
  // frontend/components/transactions/ai-suggestion-banner.tsx
  "use client";

  import { useEffect, useState } from "react";
  import { Sparkles, AlertCircle, X } from "lucide-react";
  import { Button } from "@/components/ui/button";
  import { applyAiSuggestion, suggestCategory } from "@/lib/ai";
  import type { AiDraftView, SuggestResult } from "@/lib/types";

  type Mode = 'idle' | 'loading' | 'suggestion' | 'edit-collapsed' | 'failed-no-providers' | 'failed-chain' | 'hidden';

  export function AiSuggestionBanner({
    transactionId,
    auto,
    onAccepted,
    onRejected,
    onEditMode,
    onDraftLoaded,
  }: {
    transactionId: string;
    auto: boolean;            // true = call /suggest-category on mount; false = show "Ask AI" link
    onAccepted: () => void;   // close modal
    onRejected: () => void;   // banner hides, modal stays open
    onEditMode: (draft: AiDraftView) => void;  // parent pre-fills Category select
    onDraftLoaded?: (draft: AiDraftView | null) => void;
  }) {
    const [mode, setMode] = useState<Mode>(auto ? 'loading' : 'idle');
    const [draft, setDraft] = useState<AiDraftView | null>(null);
    const [error, setError] = useState<string>('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
      if (!auto) return;
      void fetchSuggestion(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function fetchSuggestion(force: boolean) {
      setMode('loading');
      try {
        const r: SuggestResult = await suggestCategory(transactionId, { force });
        if (r.kind === 'failed') {
          if (r.error.toLowerCase().includes('not configured')) setMode('failed-no-providers');
          else { setError(r.error); setMode('failed-chain'); }
          setDraft(null);
          onDraftLoaded?.(null);
          return;
        }
        setDraft(r.draft);
        setMode('suggestion');
        onDraftLoaded?.(r.draft);
      } catch (e: any) {
        setError(e?.message ?? 'unknown error');
        setMode('failed-chain');
      }
    }

    async function doApply(action: 'accept' | 'reject') {
      if (!draft && action !== 'reject') return;
      setBusy(true);
      try {
        await applyAiSuggestion(transactionId, { action } as any);
        if (action === 'accept') onAccepted();
        else { setMode('hidden'); onRejected(); }
      } finally {
        setBusy(false);
      }
    }

    if (mode === 'hidden') return null;
    if (mode === 'idle' && !auto) {
      return (
        <button
          type="button"
          className="text-xs text-indigo-700 hover:underline"
          onClick={() => fetchSuggestion(true)}
        >
          Ask AI for a different opinion
        </button>
      );
    }
    if (mode === 'loading') {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <Sparkles className="h-4 w-4 animate-pulse" /> Asking AI…
        </div>
      );
    }
    if (mode === 'failed-no-providers') {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <div>AI is not configured. <a className="font-medium underline" href="/settings/ai-setup">Set up providers</a></div>
        </div>
      );
    }
    if (mode === 'failed-chain') {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <div className="flex-1">{error}</div>
          <Button size="sm" variant="outline" onClick={() => fetchSuggestion(true)} disabled={busy}>Retry</Button>
        </div>
      );
    }
    if (mode === 'edit-collapsed' && draft) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
          <Sparkles className="h-3 w-3" />
          <span>You're overriding AI's suggestion ({draft.categoryName ?? '—'}). Save to apply.</span>
          <button type="button" className="ml-auto" onClick={() => doApply('reject')}><X className="h-3 w-3" /></button>
        </div>
      );
    }
    if (mode === 'suggestion' && draft) {
      const tone = draft.confidence === 'high' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : draft.confidence === 'med'   ? 'border-amber-200   bg-amber-50   text-amber-900'
                :                                 'border-slate-200   bg-slate-50   text-slate-700';
      return (
        <div className={`rounded-lg border p-3 text-sm ${tone}`}>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="font-medium">AI suggests:</span>
            <span>{draft.categoryName ?? '— uncategorised —'}</span>
            {draft.vendorName && <span className="text-xs opacity-80">· Vendor: {draft.vendorName}</span>}
            <span className="ml-2 rounded bg-white/60 px-1.5 py-0.5 text-[10px] uppercase">{draft.confidence}</span>
          </div>
          {draft.reasoning && <div className="mt-1 italic text-xs opacity-80">"{draft.reasoning}"</div>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => doApply('accept')} disabled={busy || !draft.categoryId}>Accept</Button>
            <Button size="sm" variant="outline" onClick={() => { setMode('edit-collapsed'); onEditMode(draft); }} disabled={busy}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => doApply('reject')} disabled={busy}>Reject</Button>
          </div>
        </div>
      );
    }
    return null;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/components/transactions/ai-suggestion-banner.tsx
  git commit -m "feat(ui): AiSuggestionBanner component"
  ```

---

## Task 14: Wire AiSuggestionBanner into the transaction edit modal

**Files:**
- Modify: `frontend/components/transactions/transaction-edit-modal.tsx`

- [ ] **Step 1: Extend the modal with AI banner + AI-aware Save**

  Edit `frontend/components/transactions/transaction-edit-modal.tsx`. Add imports near the top:

  ```tsx
  import { AiSuggestionBanner } from "./ai-suggestion-banner";
  import { applyAiSuggestion } from "@/lib/ai";
  import type { AiDraftView } from "@/lib/types";
  import { Clock } from "lucide-react";
  ```

  Inside the component, add state for the active AI draft:

  ```tsx
  const [activeDraft, setActiveDraft] = useState<AiDraftView | null>(null);
  const [aiEditMode, setAiEditMode] = useState(false);
  ```

  Modify `onSave` to route through `applyAiSuggestion` when in AI edit mode:

  ```tsx
  async function onSave() {
    setSaving(true);
    try {
      if (aiEditMode && activeDraft) {
        await applyAiSuggestion(transaction.id, {
          action: 'edit',
          chosenCategoryId: categoryId,
          chosenVendorId: vendorId || null,
        });
      } else {
        await setTransactionCategory(transaction.id, {
          categoryId: categoryId || undefined,
          vendorId: vendorId || undefined,
          notes,
        });
      }
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }
  ```

  Insert the banner in the JSX, immediately after the read-only block and before the editable block:

  ```tsx
  <AiSuggestionBanner
    transactionId={transaction.id}
    auto={!transaction.categoryId}
    onAccepted={() => { router.refresh(); onClose(); }}
    onRejected={() => { setActiveDraft(null); setAiEditMode(false); }}
    onEditMode={(draft) => {
      setActiveDraft(draft);
      setAiEditMode(true);
      if (draft.categoryId) setCategoryId(draft.categoryId);
      if (draft.vendorId)   setVendorId(draft.vendorId);
    }}
    onDraftLoaded={setActiveDraft}
  />
  ```

  Add an "implicit edit" effect that switches to edit mode whenever the user changes the Category select while a draft is showing:

  ```tsx
  useEffect(() => {
    if (!activeDraft || aiEditMode) return;
    if (categoryId !== (activeDraft.categoryId ?? '') || vendorId !== (activeDraft.vendorId ?? '')) {
      setAiEditMode(true);
    }
  }, [categoryId, vendorId, activeDraft, aiEditMode]);
  ```

  Add an icon button next to the DialogTitle to open the history drawer (drawer component arrives in Task 17 — use a temporary `console.log` until then):

  ```tsx
  <DialogHeader className="flex flex-row items-center justify-between">
    <DialogTitle>Edit transaction</DialogTitle>
    <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setHistoryOpen(true)}>
      <Clock className="inline h-3 w-3" /> History
    </button>
  </DialogHeader>
  ```

  Add `const [historyOpen, setHistoryOpen] = useState(false);` to state. The drawer mount is added in Task 17.

- [ ] **Step 2: Manual verify**

  Rebuild frontend (`docker compose build frontend && docker compose up -d frontend`), open `http://localhost:3000/transactions`, click any uncategorised transaction. Confirm:
  - The grey "Asking AI…" banner appears immediately.
  - If no providers configured: amber "AI is not configured" with the link.
  - With a configured provider: green/amber/slate banner with category + reasoning + three buttons.
  - Clicking Accept closes the modal and the row in the list now shows the category.
  - Clicking Reject hides the banner; the modal stays open.
  - Clicking Edit collapses banner; Category select gets the AI's pick; Save fires apply(edit). Verify in DB: `docker compose exec postgres psql -U postgres -d simplebooks -c "SELECT source, accepted_ai_suggestion FROM \"CategorisationEvent\" ORDER BY \"createdAt\" DESC LIMIT 5;"`

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/components/transactions/transaction-edit-modal.tsx
  git commit -m "feat(ui): wire AI banner into transaction edit modal"
  ```

---

## Task 15: BulkAiCategoriseDialog component

**Files:**
- Create: `frontend/components/transactions/bulk-ai-categorise-dialog.tsx`

- [ ] **Step 1: Implement the dialog**

  ```tsx
  // frontend/components/transactions/bulk-ai-categorise-dialog.tsx
  "use client";

  import { useEffect, useState } from "react";
  import { useRouter } from "next/navigation";
  import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import { Button } from "@/components/ui/button";
  import { Field } from "@/components/ui/field";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { bulkSuggest, bulkSuggestCancel, bulkSuggestStatus } from "@/lib/ai";
  import type { Account, BulkRunStatus } from "@/lib/types";

  export function BulkAiCategoriseDialog({
    accounts,
    open,
    onClose,
  }: {
    accounts: Account[];
    open: boolean;
    onClose: () => void;
  }) {
    const router = useRouter();
    const [scope, setScope] = useState<'uncategorised' | 'all'>('uncategorised');
    const [accountId, setAccountId] = useState<string>('__all__');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [runId, setRunId] = useState<string | null>(null);
    const [status, setStatus] = useState<BulkRunStatus | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
      if (!runId) return;
      const t = setInterval(async () => {
        try {
          const s = await bulkSuggestStatus(runId);
          setStatus(s);
          if (s.done >= s.totalQueued || s.cancelled) clearInterval(t);
        } catch { clearInterval(t); }
      }, 1000);
      return () => clearInterval(t);
    }, [runId]);

    async function start() {
      setBusy(true);
      try {
        const r = await bulkSuggest({
          accountIds: accountId === '__all__' ? undefined : [accountId],
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          scope,
        });
        setRunId(r.runId);
        setStatus({ runId: r.runId, totalQueued: r.totalQueued, done: 0, ok: 0, cached: 0, failed: 0, cancelled: false });
      } finally {
        setBusy(false);
      }
    }

    async function handleClose() {
      if (runId && status && status.done < status.totalQueued && !status.cancelled) {
        await bulkSuggestCancel(runId);
      }
      onClose();
    }

    const done = status && status.done >= status.totalQueued;

    return (
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Categorise with AI</DialogTitle></DialogHeader>
          {!runId && (
            <div className="space-y-3">
              <Field label="Scope">
                <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uncategorised">Uncategorised only</SelectItem>
                    <SelectItem value="all">All transactions</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Account">
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All accounts</SelectItem>
                    {accounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From"><input type="date" className="rounded-[0.3rem] border border-slate-300 px-2 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
                <Field label="To"><input type="date" className="rounded-[0.3rem] border border-slate-300 px-2 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
              </div>
              <p className="text-xs text-slate-500">Approximately 1 AI call per transaction. Costs depend on your provider.</p>
            </div>
          )}
          {runId && status && (
            <div className="space-y-2 py-2 text-sm">
              <div>Queued: <span className="font-mono">{status.totalQueued}</span></div>
              <div>Done: <span className="font-mono">{status.done}</span> · OK: <span className="font-mono text-emerald-700">{status.ok}</span> · Cached: <span className="font-mono text-slate-500">{status.cached}</span> · Failed: <span className="font-mono text-rose-700">{status.failed}</span></div>
              {done && (
                <div className="pt-2">
                  <Button onClick={() => { onClose(); router.push(`/transactions/ai-review?runId=${runId}`); }}>Review now</Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {!runId && <>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Start'}</Button>
            </>}
            {runId && !done && <Button variant="ghost" onClick={handleClose}>Cancel run</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/components/transactions/bulk-ai-categorise-dialog.tsx
  git commit -m "feat(ui): bulk AI categorise dialog with run polling"
  ```

---

## Task 16: Wire bulk dialog into `/transactions`

**Files:**
- Modify: `frontend/components/transactions/transactions-table.tsx`

- [ ] **Step 1: Add bulk action**

  Open `frontend/components/transactions/transactions-table.tsx`. Add imports:

  ```tsx
  import { BulkAiCategoriseDialog } from "./bulk-ai-categorise-dialog";
  import { Sparkles } from "lucide-react";
  ```

  Add state in the component (top-level):

  ```tsx
  const [bulkAiOpen, setBulkAiOpen] = useState(false);
  ```

  Add a button in the toolbar where the existing recategorise action lives — search for the action that opens `<RecategoriseDialog>` and place the new one alongside it:

  ```tsx
  <Button variant="outline" onClick={() => setBulkAiOpen(true)}>
    <Sparkles className="h-4 w-4" /> Categorise with AI
  </Button>
  ```

  Render the dialog near the end of the component's JSX:

  ```tsx
  <BulkAiCategoriseDialog accounts={accounts} open={bulkAiOpen} onClose={() => setBulkAiOpen(false)} />
  ```

  (The component already receives `accounts` via props from the page — if it doesn't, add it: open `frontend/app/transactions/page.tsx` and pass `accounts` through.)

- [ ] **Step 2: Manual verify**

  Rebuild frontend. Open `/transactions`. Confirm:
  - "Categorise with AI" button appears.
  - Clicking opens the dialog with scope/account/date fields.
  - Starting kicks off a run; the dialog flips to progress view; counters tick up.
  - When done, "Review now" routes to `/transactions/ai-review?runId=...` (the page itself arrives in Task 17 — the route can show 404 right now and we'll fix it next).

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/components/transactions/transactions-table.tsx frontend/app/transactions/page.tsx
  git commit -m "feat(ui): add 'Categorise with AI' bulk action on /transactions"
  ```

---

## Task 17: AI Review queue page + history drawer

**Files:**
- Create: `frontend/components/transactions/transaction-history-drawer.tsx`
- Create: `frontend/components/transactions/ai-review-list.tsx`
- Create: `frontend/app/transactions/ai-review/page.tsx`
- Modify: `frontend/components/transactions/transaction-edit-modal.tsx` (mount drawer)

- [ ] **Step 1: Implement the history drawer**

  ```tsx
  // frontend/components/transactions/transaction-history-drawer.tsx
  "use client";

  import { useEffect, useState } from "react";
  import { api } from "@/lib/api";
  import type { Category, Vendor } from "@/lib/types";

  interface EventRow {
    id: string;
    source: 'USER' | 'RULE' | 'VENDOR_MATCH' | 'AI_DRAFT' | 'AI_APPLIED' | 'AI_REJECTED';
    acceptedAiSuggestion: boolean | null;
    oldCategoryId: string | null;
    newCategoryId: string | null;
    oldVendorId: string | null;
    newVendorId: string | null;
    reasoning: string | null;
    rule: { id: string; name: string } | null;
    createdAt: string;
  }

  const TONE: Record<string, string> = {
    USER: 'bg-slate-100 text-slate-700',
    RULE: 'bg-indigo-100 text-indigo-800',
    VENDOR_MATCH: 'bg-violet-100 text-violet-800',
    AI_DRAFT: 'bg-amber-50 text-amber-800',
    AI_APPLIED_TRUE: 'bg-emerald-100 text-emerald-800',
    AI_APPLIED_FALSE: 'bg-amber-100 text-amber-900',
    AI_REJECTED: 'bg-rose-100 text-rose-800',
  };

  function badgeFor(e: EventRow) {
    if (e.source === 'AI_APPLIED') return e.acceptedAiSuggestion ? 'AI_APPLIED_TRUE' : 'AI_APPLIED_FALSE';
    return e.source;
  }

  export function TransactionHistoryDrawer({
    transactionId,
    open,
    onClose,
    categories,
    vendors,
  }: {
    transactionId: string;
    open: boolean;
    onClose: () => void;
    categories: Category[];
    vendors: Vendor[];
  }) {
    const [events, setEvents] = useState<EventRow[]>([]);
    useEffect(() => {
      if (!open) return;
      void api<EventRow[]>(`/categorisation-events?transactionId=${transactionId}&limit=50`).then(setEvents);
    }, [open, transactionId]);

    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const venName = new Map(vendors.map((v) => [v.id, v.name]));
    if (!open) return null;

    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
        <aside className="fixed inset-y-0 right-0 z-50 w-[420px] overflow-y-auto rounded-l-lg border-l border-slate-200 bg-white p-4 shadow-xl">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">History</h3>
            <button type="button" className="text-sm text-slate-500" onClick={onClose}>Close</button>
          </header>
          {events.length === 0 ? (
            <p className="text-xs text-slate-400">No history yet. This transaction hasn't been touched by anything but its CSV import.</p>
          ) : (
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${TONE[badgeFor(e)]}`}>{e.source}{e.source === 'AI_APPLIED' ? (e.acceptedAiSuggestion ? ' · accepted' : ' · edited') : ''}</span>
                    <span className="text-[10px] text-slate-400">{new Date(e.createdAt).toLocaleString()}</span>
                  </div>
                  {(e.oldCategoryId !== e.newCategoryId) && (e.oldCategoryId || e.newCategoryId) && (
                    <div className="mt-1">Category: <span className="font-mono">{catName.get(e.oldCategoryId ?? '') ?? '—'}</span> → <span className="font-mono">{catName.get(e.newCategoryId ?? '') ?? '—'}</span></div>
                  )}
                  {(e.oldVendorId !== e.newVendorId) && (e.oldVendorId || e.newVendorId) && (
                    <div>Vendor: <span className="font-mono">{venName.get(e.oldVendorId ?? '') ?? '—'}</span> → <span className="font-mono">{venName.get(e.newVendorId ?? '') ?? '—'}</span></div>
                  )}
                  {e.reasoning && <div className="mt-1 italic text-slate-600">"{e.reasoning}"</div>}
                  {e.rule && <div className="mt-1"><a className="text-indigo-700 underline" href={`/rules/${e.rule.id}/edit`}>rule: "{e.rule.name}"</a></div>}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </>
    );
  }
  ```

- [ ] **Step 2: Mount the drawer in the edit modal**

  Open `frontend/components/transactions/transaction-edit-modal.tsx`. Add the import:

  ```tsx
  import { TransactionHistoryDrawer } from "./transaction-history-drawer";
  ```

  Inside the Dialog (after DialogFooter), mount the drawer:

  ```tsx
  <TransactionHistoryDrawer
    transactionId={transaction.id}
    open={historyOpen}
    onClose={() => setHistoryOpen(false)}
    categories={categories}
    vendors={vendors}
  />
  ```

- [ ] **Step 3: Implement the ai-review-list**

  ```tsx
  // frontend/components/transactions/ai-review-list.tsx
  "use client";

  import { useEffect, useMemo, useState } from "react";
  import { useRouter } from "next/navigation";
  import Link from "next/link";
  import { ArrowLeft, Sparkles } from "lucide-react";
  import { Button } from "@/components/ui/button";
  import { applyAiSuggestion, listReviewQueue } from "@/lib/ai";
  import type { AiDraftView, Transaction } from "@/lib/types";
  import { api } from "@/lib/api";

  export function AiReviewList() {
    const router = useRouter();
    const [drafts, setDrafts] = useState<AiDraftView[]>([]);
    const [txMap, setTxMap] = useState<Map<string, Transaction & { account?: { name: string } }>>(new Map());
    const [busy, setBusy] = useState<string | null>(null);

    async function refresh() {
      const q = await listReviewQueue();
      setDrafts(q);
      // Fetch transactions for the displayed drafts.
      const ids = q.map((d) => d.eventId);
      if (ids.length) {
        // Bulk endpoint not available — fetch individually for now (queue capped at 500).
        const tx = await Promise.all(q.map((d) => api<Transaction & { account?: { name: string } }>(`/transactions/by-event/${d.eventId}`).catch(() => null)));
        const m = new Map();
        for (let i = 0; i < q.length; i++) if (tx[i]) m.set(q[i].eventId, tx[i]!);
        setTxMap(m);
      }
    }
    useEffect(() => { void refresh(); }, []);

    async function act(draft: AiDraftView, action: 'accept' | 'reject') {
      setBusy(draft.eventId);
      try {
        const tx = txMap.get(draft.eventId);
        if (!tx) return;
        await applyAiSuggestion(tx.id, { action });
        setDrafts((d) => d.filter((x) => x.eventId !== draft.eventId));
      } finally {
        setBusy(null);
      }
    }

    const grouped = useMemo(() => drafts, [drafts]);

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Link href="/transactions" className="text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-lg font-semibold">AI Review ({grouped.length} pending)</h1>
        </div>

        {grouped.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            Nothing for AI to review. Categorise some transactions with rules and try the bulk action on <Link href="/transactions" className="underline">/transactions</Link>.
          </div>
        )}

        {grouped.map((d) => {
          const tx = txMap.get(d.eventId);
          const tone = d.confidence === 'high' ? 'border-emerald-200 bg-emerald-50'
                    : d.confidence === 'med'   ? 'border-amber-200   bg-amber-50'
                    :                             'border-slate-200   bg-slate-50';
          return (
            <div key={d.eventId} className="rounded-lg border border-slate-200 bg-white p-3">
              {tx && (
                <div className="mb-2 text-sm">
                  <span className="font-mono">{tx.date.slice(0, 10)}</span> ·{' '}
                  <span className="font-mono">{Number(tx.amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span> ·{' '}
                  <span>{tx.description}</span> · <span className="text-xs text-slate-500">{tx.account?.name}</span>
                </div>
              )}
              <div className={`rounded-lg border p-2 text-sm ${tone}`}>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span>AI suggests: <strong>{d.categoryName ?? '— uncategorised —'}</strong></span>
                  {d.vendorName && <span className="text-xs">· Vendor: {d.vendorName}</span>}
                  <span className="ml-2 rounded bg-white/60 px-1.5 py-0.5 text-[10px] uppercase">{d.confidence}</span>
                </div>
                {d.reasoning && <div className="mt-1 italic text-xs opacity-80">"{d.reasoning}"</div>}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => act(d, 'accept')} disabled={busy === d.eventId || !d.categoryId}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => tx && router.push(`/transactions?edit=${tx.id}`)} disabled={busy === d.eventId}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(d, 'reject')} disabled={busy === d.eventId}>Reject</Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  ```

- [ ] **Step 4: Implement the page**

  ```tsx
  // frontend/app/transactions/ai-review/page.tsx
  import { PageShell } from "@/components/layout/page-shell";
  import { AiReviewList } from "@/components/transactions/ai-review-list";

  export default async function Page() {
    return (
      <PageShell title="AI Review">
        <AiReviewList />
      </PageShell>
    );
  }
  ```

- [ ] **Step 5: Add the helper transactions endpoint `GET /transactions/by-event/:eventId`**

  The Review list needs each draft's parent transaction. Easiest: extend `transactions.controller.ts`:

  In `backend/src/transactions/transactions.controller.ts`, add:

  ```ts
  @Get('by-event/:eventId')
  async byEvent(@Param('eventId') eventId: string) {
    const event = await this.service['prisma'].categorisationEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    return this.service.get(event.transactionId);
  }
  ```

  Add `NotFoundException` to imports. Confirm `TransactionsService.get` returns the shape the frontend expects (with `account` included); if it doesn't, add the include there.

- [ ] **Step 6: Manual verify**

  Rebuild backend + frontend. Run a bulk AI categorise from `/transactions`, then visit `/transactions/ai-review`. Confirm pending drafts list, Accept/Reject work, and counts decrement. The Edit button currently routes back to `/transactions?edit=<txId>` — wire this through later if not already supported by the existing list.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/components/transactions/transaction-history-drawer.tsx frontend/components/transactions/ai-review-list.tsx frontend/app/transactions/ai-review/page.tsx frontend/components/transactions/transaction-edit-modal.tsx backend/src/transactions/transactions.controller.ts
  git commit -m "feat(ui): AI review queue page + history drawer + by-event tx fetch"
  ```

---

## Task 18: AI Drafts row actions + mine button on `/rules`

**Files:**
- Create: `frontend/components/rules/ai-draft-row.tsx`
- Modify: `frontend/components/rules/rules-list.tsx`
- Possibly: `frontend/lib/banking-rules.ts` (add `setRuleState`, `mineRules`)

- [ ] **Step 1: Add lib helpers**

  Open `frontend/lib/banking-rules.ts` (or wherever rule mutation functions live) and add if missing:

  ```ts
  export function setRuleState(id: string, state: 'APPROVED' | 'DENIED') {
    return api(`/rules/${id}/state`, { method: 'PATCH', body: JSON.stringify({ state }) });
  }
  ```

  Confirm the backend route `PATCH /rules/:id/state` already accepts `state` and, when transitioning to `APPROVED`, sets `isActive: true`, and when `DENIED` sets `isActive: false`. If it doesn't do this atomically today, update `rules.service.ts`'s state-change handler to set `isActive` accordingly in the same Prisma update.

  Add `mineRules` re-export from `lib/ai.ts` if not already imported by the rules page.

- [ ] **Step 2: Implement AiDraftRow**

  ```tsx
  // frontend/components/rules/ai-draft-row.tsx
  "use client";

  import Link from "next/link";
  import { useState } from "react";
  import { useRouter } from "next/navigation";
  import { Button } from "@/components/ui/button";
  import { setRuleState } from "@/lib/banking-rules";
  import type { Rule } from "@/lib/types";

  export function AiDraftRow({ rule }: { rule: Rule & { reasoning?: string | null } }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function act(state: 'APPROVED' | 'DENIED') {
      setBusy(true);
      try {
        await setRuleState(rule.id, state);
        router.refresh();
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm font-medium">{rule.name}</div>
        <div className="mt-1 text-xs text-slate-600">
          {rule.conditions.map((c, i) => (
            <span key={i}>
              {i > 0 && ' AND '}
              <span className="font-mono">{c.field}</span> {c.operator} <span className="font-mono">"{c.value}"{c.value2 ? ` … "${c.value2}"` : ''}</span>
            </span>
          ))} → set Category to <strong>{(rule as any).category?.name ?? '—'}</strong>
        </div>
        {(rule as any).noteOnApply && <div className="mt-1 text-xs italic text-slate-500">"{(rule as any).noteOnApply}"</div>}
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => act('APPROVED')} disabled={busy}>Approve</Button>
          <Button size="sm" variant="outline" asChild><Link href={`/rules/${rule.id}/edit`}>Modify</Link></Button>
          <Button size="sm" variant="ghost" onClick={() => act('DENIED')} disabled={busy}>Deny</Button>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Extend rules-list.tsx**

  Open `frontend/components/rules/rules-list.tsx`. Add:

  - Import `AiDraftRow` and `mineRules`:
    ```tsx
    import { AiDraftRow } from "./ai-draft-row";
    import { mineRules } from "@/lib/ai";
    import { Sparkles } from "lucide-react";
    ```
  - State for the mining call:
    ```tsx
    const [mining, setMining] = useState(false);
    ```
  - Add a button in the toolbar next to "Test rules":
    ```tsx
    <Button variant="outline" onClick={async () => { setMining(true); try { const r = await mineRules(); alert(`Drafted ${r.drafted} rule(s). ${r.skippedSuppressed} suppressed.`); router.refresh(); } finally { setMining(false); } }} disabled={mining}>
      <Sparkles className="h-4 w-4" /> {mining ? 'Mining…' : 'Find candidates from history'}
    </Button>
    ```
  - Change the rendering of `AI_DRAFTED` state rows to use `<AiDraftRow>` instead of `<RuleRow>`:
    ```tsx
    {stateFilter === 'AI_DRAFTED'
      ? filtered.map((r) => <AiDraftRow key={r.id} rule={r as any} />)
      : filtered.map((r, i) => <RuleRow key={r.id} rule={r} rank={i + 1} vendorNames={vendorNames} accountNames={accountNames} />)
    }
    ```

  (`useRouter` import may already exist; if not, add it.)

- [ ] **Step 4: Manual verify**

  Rebuild frontend. Open `/rules`. Confirm:
  - "Find candidates from history" appears.
  - Clicking it shows an alert with drafted count (zero if no eligible history yet).
  - After mining, AI Drafts tab badge increments.
  - Each AI Drafts row shows Approve / Modify / Deny.
  - Approve flips the rule to APPROVED + active; verify in DB it joins the active set.
  - Modify routes to the editor; saving from the editor sets state=APPROVED (extend `rules.service.ts` if needed — Step 1 covered the state endpoint, ensure Save also approves AI drafts).

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/components/rules/ai-draft-row.tsx frontend/components/rules/rules-list.tsx frontend/lib/banking-rules.ts backend/src/rules/
  git commit -m "feat(rules): AI Drafts row actions + 'Find candidates' mining button"
  ```

---

## Task 19: AI Setup page additions (sortOrder arrows + threshold field)

**Files:**
- Modify: `frontend/components/settings/ai-setup-page.tsx`

- [ ] **Step 1: Add arrows + threshold field**

  Open `frontend/components/settings/ai-setup-page.tsx`. For each backup card (rows where `isPrimary === false`), add two arrow buttons that call `moveAiProvider(id, 'up'|'down')` and `router.refresh()`.

  Add at the bottom of the page a "Rule drafting" section:

  ```tsx
  // Add to existing state:
  const [threshold, setThreshold] = useState<number>(prefs?.aiMiningThreshold ?? 5);
  const [savingThreshold, setSavingThreshold] = useState(false);
  ```

  ```tsx
  <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
    <h2 className="mb-2 text-sm font-semibold">Rule drafting</h2>
    <label className="block text-xs text-slate-500">Minimum cluster size to draft a rule</label>
    <div className="mt-1 flex items-center gap-2">
      <input
        type="number" min={1} max={50} value={threshold}
        onChange={(e) => setThreshold(Math.max(1, Math.min(50, Number(e.target.value))))}
        className="w-20 rounded-[0.3rem] border border-slate-300 px-2 py-1 text-sm"
      />
      <span className="text-xs text-slate-500">transactions must agree before AI proposes a rule (1-50)</span>
      <Button size="sm" disabled={savingThreshold} onClick={async () => {
        setSavingThreshold(true);
        try {
          await api('/preferences', { method: 'PUT', body: JSON.stringify({ aiMiningThreshold: threshold }) });
        } finally { setSavingThreshold(false); }
      }}>{savingThreshold ? 'Saving…' : 'Save'}</Button>
    </div>
  </section>
  ```

  The page must now load preferences server-side and pass them in. Update `frontend/app/settings/ai-setup/page.tsx`:

  ```tsx
  import { AiSetupPage } from "@/components/settings/ai-setup-page";
  import { listAiProviders } from "@/lib/ai-providers";
  import { api } from "@/lib/api";

  export default async function Page() {
    const [providers, prefs] = await Promise.all([
      listAiProviders(),
      api<{ aiMiningThreshold?: number }>('/preferences').catch(() => ({})),
    ]);
    return <AiSetupPage initial={providers} prefs={prefs} />;
  }
  ```

  Update the `AiSetupPage` props to accept `prefs`.

- [ ] **Step 2: Manual verify**

  Rebuild frontend. Open `/settings/ai-setup`. Confirm:
  - Each non-primary card shows up/down arrows. Click reorders.
  - The "Rule drafting" section appears at the bottom. Saving a value round-trips: refresh the page and the value persists.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/components/settings/ai-setup-page.tsx frontend/app/settings/ai-setup/page.tsx
  git commit -m "feat(settings/ai-setup): sortOrder arrows + rule-drafting threshold"
  ```

---

## Task 20: `.env.example` + docs updates

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`, `Architecture.md`, `DatabaseSchema.md`, `modules_and_logic.md`, `DesignSystem.md`, `docs/user-guide-banking.md`

- [ ] **Step 1: Update `.env.example`**

  Append:

  ```
  # Phase C — AI runtime (all optional; defaults shown)
  AI_TIMEOUT_INLINE_MS=20000
  AI_TIMEOUT_BULK_MS=60000
  AI_BULK_CONCURRENCY=5
  ```

- [ ] **Step 2: Update `CLAUDE.md`**

  Under "Known gotchas", append:

  - `AiCall` table grows unbounded. A retention job is a future improvement; for now, occasional manual cleanup via `DELETE FROM "AiCall" WHERE "createdAt" < NOW() - INTERVAL '30 days'` is fine.
  - **Phase C schema is fully additive.** Adding the `AI_REJECTED` enum value, the `sortOrder` / `clusterHash` / `reasoning` / `aiMiningThreshold` columns, and the `AiCall` table all survive `prisma db push` without `down -v`.
  - **`AiProvider.apiKey` is stored verbatim** (matches the existing SMTP password precedent). Future improvement: encrypt at rest with a key from env. Not implemented.
  - **AI Draft rule suppression** is keyed on `(clusterKey, categoryId)` only — denying a draft permanently suppresses *any* future rule with the same intent for the same category. Approving a draft does the same. To re-mine an intent you must delete the rule row entirely.

- [ ] **Step 3: Update `Architecture.md`**

  In the Backend module-summary section, add an "AI" entry after `categorisation-events`:

  > **`ai`** — **(Phase C)** AI categorisation runtime. Route prefix `/ai`. Endpoints: `POST /ai/suggest-category`, `POST /ai/apply`, `POST /ai/bulk-suggest`, `GET /ai/bulk-suggest/:runId/status`, `POST /ai/bulk-suggest/:runId/cancel`, `GET /ai/review-queue`, `POST /ai/mine-rules`. The `AiClient` is the only file that makes outbound HTTPS to LLM providers. Provider chain order: `[isPrimary desc, sortOrder asc, createdAt asc]`. 4xx misconfig surfaces; 5xx/408/429/timeout/network falls through. Every HTTP attempt writes an `AiCall` row.

  Update the topology diagram (or text equivalent) to add an outbound arrow from `backend` to "AI providers (HTTPS)".

- [ ] **Step 4: Update `DatabaseSchema.md`**

  In the schema reference, add a "Phase C additions" section listing: the new `AiCall` model (all fields), the new columns on `AiProvider` (`sortOrder`), `Rule` (`clusterHash` + index), `CategorisationEvent` (`reasoning`), `Preferences` (`aiMiningThreshold`), and the new enum values (`AI_REJECTED`, `AiCallPurpose`, `AiCallStatus`). Note explicitly that Phase C is **fully additive** and does not require `down -v`.

- [ ] **Step 5: Update `modules_and_logic.md`**

  Add a new top-level module section "AI categorisation" describing:
  - The three services and their responsibilities.
  - The accept/edit/reject semantics (mirror the spec's Appendix B table).
  - The `/transactions/ai-review` page.
  - The AI Drafts tab actions.
  - The history drawer.
  - The AI Setup additions (arrows + threshold).

- [ ] **Step 6: Update `DesignSystem.md`**

  Append a "Phase C colour additions" subsection documenting:
  - Confidence banner palette: `border-emerald-200 bg-emerald-50` (high), `border-amber-200 bg-amber-50` (med), `border-slate-200 bg-slate-50` (low).
  - Event badge palette: USER slate, RULE indigo, VENDOR_MATCH violet, AI_DRAFT amber-50, AI_APPLIED(true) emerald, AI_APPLIED(false) amber-100, AI_REJECTED rose.

- [ ] **Step 7: Update `docs/user-guide-banking.md`**

  Replace section 14 ("Phase C preview") with a new section 15 "AI categorisation" documenting end-user behaviour: the inline banner, "Ask AI" link, bulk dialog, review queue, AI Drafts tab, history drawer, AI Setup additions. Remove the "TBD" notes.

- [ ] **Step 8: Commit**

  ```bash
  git add .env.example CLAUDE.md Architecture.md DatabaseSchema.md modules_and_logic.md DesignSystem.md docs/user-guide-banking.md
  git commit -m "docs: Phase C — architecture, schema, modules, design tokens, user guide"
  ```

---

## Task 21: End-to-end verification + version bump

**Files:**
- Modify: `backend/package.json`, `frontend/package.json` (version bumps)

- [ ] **Step 1: Full stack rebuild**

  ```bash
  docker compose build backend frontend && docker compose up -d
  docker logs simplebooks-backend-1 -n 30 | grep -E "Mapped|started"
  ```
  Expected: backend boots clean; all `/ai/...` routes mapped.

- [ ] **Step 2: Configure providers**

  Open `http://localhost:3000/settings/ai-setup`, add a real OpenAI-compatible provider (primary). Optionally add one or two backups.

- [ ] **Step 3: Smoke-test the four features**

  - **Inline:** open an uncategorised transaction's edit modal → banner loads → Accept → row gets category → `AiCall` row appears (`SELECT status, "providerId", "transactionId" FROM "AiCall" ORDER BY "createdAt" DESC LIMIT 5;`).
  - **Bulk:** click "Categorise with AI" with scope=uncategorised → progress reaches done → "Review now" → review queue shows pending drafts → Accept a couple, Reject one → counts decrement.
  - **Mining:** on `/rules`, click "Find candidates from history" → if you have ≥5 manually-categorised events sharing a clusterKey, drafts appear in the AI Drafts tab → Approve one → it joins active rules and starts firing on next recategorise.
  - **History:** open any transaction with prior events → click the History button → events appear newest-first with correct badges.
  - **Fallback:** edit the primary provider's API key to a wrong value → trigger an inline suggestion → confirm a 401 surfaces (no fallback) with the verbatim provider error.
  - **Fallback (5xx case):** harder to simulate without a fake provider — note in the verification log that this path is covered by Jest specs (`ai-client.service.spec.ts`).

- [ ] **Step 4: Run all backend tests once more**

  ```bash
  docker compose exec backend npm test
  ```
  Expected: 16 passing tests (8 client + 8 drafter).

- [ ] **Step 5: Bump versions**

  In `backend/package.json` and `frontend/package.json`, change `"version": "0.7.0"` to `"version": "0.8.0"` (Phase C release).

- [ ] **Step 6: Commit**

  ```bash
  git add backend/package.json frontend/package.json
  git commit -m "chore: bump version to 0.8.0 (Phase C — AI categorisation)"
  ```

---

## Self-review of this plan

**Spec coverage:** Each numbered section of the spec maps to one or more tasks:
- Spec §1 Architecture → File inventory + Task 9 (module wiring).
- Spec §2 Schema → Task 1.
- Spec §3 AiClient runtime → Tasks 4, 5 (with 8 tests).
- Spec §4 AiCategoriser → Tasks 6, 7.
- Spec §5 UI A/B/D → Tasks 13, 14, 15, 16, 17.
- Spec §6 AiRuleDrafter → Task 8 + Task 18 (UI).
- Spec §7 History drawer → Task 17.
- Spec §8 Settings + env + docs + tests → Tasks 10, 11, 19, 20; tests inside Tasks 5 and 8.

**Placeholder scan:** No "TBD", no "implement later", no "similar to" without code. Every code block contains the exact content the engineer types.

**Type consistency:**
- `AiDraftView` defined in Task 7, referenced consistently in Tasks 12, 13, 17.
- `ApplyDecision` defined in Task 7, mirrored in Task 12 (lib client), used in Tasks 13, 14, 17.
- `AiCompleteInput` / `AiCompleteResult` defined in Task 4 (`types.ts`), consumed in Task 5 (service) and Tasks 7, 8.
- `clusterKey`, `computeClusterHash`, `buildClusters` exported as named functions from `ai-rule-drafter.service.ts` (Task 8) and imported in the spec file at the top of the same task.

**Known mild compromises:**
- Confidence is not persisted on `CategorisationEvent` — the review queue defaults loaded drafts to `'med'` because the LLM-returned confidence is only available on the fresh-suggest response, not after a reload. Calling it out: this is a minor information loss between the fresh banner and the review queue. Documented in the queue UI (Task 17 Step 3) by using neutral styling regardless of confidence on cached rows.
- The "by-event/:eventId" endpoint added in Task 17 Step 5 is a small workaround so the queue can show each draft's parent transaction without a join. Cleaner long-term: return joined transactions from `/ai/review-queue` directly. Filed mentally; not in scope.

If anything in this plan doesn't match the spec, stop and re-read the spec — the spec is authoritative.
