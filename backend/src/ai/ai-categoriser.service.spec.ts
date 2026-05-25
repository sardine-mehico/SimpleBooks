import { buildCategoriseUserPrompt } from './prompts/categorise';
import { AiCategoriserService } from './ai-categoriser.service';

describe('buildCategoriseUserPrompt', () => {
  it('renders leaves with parent breadcrumbs', () => {
    const out = buildCategoriseUserPrompt({
      categories: [
        { id: 'c1', name: 'Bank Fees', kind: 'EXPENSE', usageCount: 5, parentName: 'Banking' } as any,
        { id: 'c2', name: 'Stationery', kind: 'EXPENSE', usageCount: 2, parentName: null } as any,
      ],
      vendors: [],
      fewShots: [],
      tx: { date: '2026-05-25', amount: '-12.50', description: 'TEST', vendorGuess: null, accountName: 'Cheque' },
    });
    expect(out).toContain('Banking > Bank Fees');
    expect(out).toContain('Stationery');
    expect(out).not.toContain('Banking > Stationery');
  });
});

describe('AiCategoriserService.suggest', () => {
  it('records providerId on the AI_DRAFT CategorisationEvent', async () => {
    const created: any[] = [];
    const prisma: any = {
      transaction: { findUnique: jest.fn().mockResolvedValue({ id: 't1', date: new Date('2026-05-25'), amount: '-12.50', description: 'X', vendorId: null, account: { id: 'a1', name: 'Cheque' } }) },
      category: { findMany: jest.fn().mockResolvedValue([{ id: 'cat1', name: 'Bank Fees', kind: 'EXPENSE', isActive: true, _count: { transactions: 1 }, parent: null }]) },
      vendor: { findMany: jest.fn().mockResolvedValue([]) },
      categorisationEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async ({ data }: any) => { const row = { id: 'e1', createdAt: new Date(), ...data }; created.push(row); return row; }),
      },
      aiProvider: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Provider' }) },
    };
    const ai: any = {
      complete: jest.fn().mockResolvedValue({ ok: true, data: { categoryId: 'cat1', vendorId: null, confidence: 'high', reasoning: 'ok' }, providerId: 'prov-1', attempts: 1, promptTokens: 10, completionTokens: 5 }),
    };
    await new AiCategoriserService(prisma, ai).suggest('t1');
    expect(created).toHaveLength(1);
    expect(created[0].providerId).toBe('prov-1');
    expect(created[0].source).toBe('AI_DRAFT');
  });
});
