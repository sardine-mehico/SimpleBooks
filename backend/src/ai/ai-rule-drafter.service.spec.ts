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
