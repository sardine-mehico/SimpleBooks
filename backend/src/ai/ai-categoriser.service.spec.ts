import { buildCategoriseUserPrompt } from './prompts/categorise';

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
