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

// requestsPerMinute=6000 makes pacing effectively a 10ms gap — keeps tests fast.
const providers = [
  { id: 'p1', name: 'Primary',  model: 'm', apiBaseUrl: 'http://p1', apiKey: 'k1', isPrimary: true,  sortOrder: 0,    requestsPerMinute: 6000 },
  { id: 'p2', name: 'Backup-2', model: 'm', apiBaseUrl: 'http://p2', apiKey: 'k2', isPrimary: false, sortOrder: 1000, requestsPerMinute: 6000 },
  { id: 'p3', name: 'Backup-3', model: 'm', apiBaseUrl: 'http://p3', apiKey: 'k3', isPrimary: false, sortOrder: 1010, requestsPerMinute: 6000 },
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

  it('falls through on 408 timeout and 429 rate limit (with 2 in-provider 429 retries)', async () => {
    // 429s now retry-with-backoff inside the provider before falling through. With MAX_429_RETRIES=2,
    // p2 sees 3 × 429 (initial + 2 retries) before the chain advances to p3.
    const prisma = makePrisma(providers);
    const fetch = mockFetch([
      { status: 408, body: {} },                  // p1: timeout → fall through immediately
      { status: 429, body: {} },                  // p2: rate limit (initial)
      { status: 429, body: {} },                  // p2: rate limit (retry 1)
      { status: 429, body: {} },                  // p2: rate limit (retry 2) → fall through
      { status: 200, body: makeOkBody({}) },      // p3: success
    ]);
    const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe('p3');
  }, 10_000);

  it('falls through on 401 (any HTTP error triggers fallback)', async () => {
    const prisma = makePrisma(providers);
    const fetch = mockFetch([
      { status: 401, body: { error: { message: 'unauthorized' } } },
      { status: 200, body: makeOkBody({}) },
    ]);
    const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe('p2');
    expect(prisma._aiCalls.map((c: any) => c.status)).toEqual(['FAILED', 'OK']);
    expect(prisma._aiCalls[0].httpStatus).toBe(401);
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

  it('returns chain-exhausted when all providers fail — reports last provider error (e.g. 3 different 4xx)', async () => {
    // 401 (wrong key), 403 (forbidden), 404 (wrong model/URL) — all tried, all failed.
    // chain-exhausted reports the LAST provider's error, which is what the UI surfaces.
    const prisma = makePrisma(providers);
    const fetch = mockFetch([
      { status: 401, body: { error: { message: 'unauthorized' } } },
      { status: 403, body: { error: { message: 'forbidden' } } },
      { status: 404, body: { error: { message: 'not found' } } },
    ]);
    const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('chain-exhausted');
      expect(r.lastError?.httpStatus).toBe(404);
      expect(r.lastError?.providerId).toBe('p3');
    }
    expect(prisma._aiCalls.filter((c: any) => c.status === 'FAILED')).toHaveLength(3);
  });

  it('falls through on 402 (Payment Required / Insufficient Balance)', async () => {
    const prisma = makePrisma(providers);
    const fetch = mockFetch([
      { status: 402, body: { error: { message: 'Insufficient Balance' } } },
      { status: 200, body: makeOkBody({}) },
    ]);
    const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe('p2');
    expect(prisma._aiCalls.map((c: any) => c.status)).toEqual(['FAILED', 'OK']);
    expect(prisma._aiCalls[0].httpStatus).toBe(402);
  });

  it('falls through on 403 too', async () => {
    const prisma = makePrisma(providers);
    const fetch = mockFetch([
      { status: 403, body: {} },
      { status: 200, body: makeOkBody({}) },
    ]);
    const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe('p2');
  });

  it('falls through on 404 (e.g. wrong model name or wrong base URL)', async () => {
    const prisma = makePrisma(providers);
    const fetch = mockFetch([
      { status: 404, body: { error: { message: 'model not found' } } },
      { status: 200, body: makeOkBody({}) },
    ]);
    const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe('p2');
    expect(prisma._aiCalls.map((c: any) => c.status)).toEqual(['FAILED', 'OK']);
    expect(prisma._aiCalls[0].httpStatus).toBe(404);
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
