import { EngineVendor, normaliseDesc } from './types';

export function matchVendor(
  description: string,
  vendors: EngineVendor[],
): { vendor: EngineVendor; ambiguous: boolean } | null {
  const haystack = normaliseDesc(description);
  type Hit = { vendor: EngineVendor; aliasLength: number };
  const hits: Hit[] = [];
  for (const v of vendors) {
    if (!v.isActive) continue;
    let bestAliasLen = 0;
    for (const alias of v.aliases) {
      const a = alias.toLowerCase();
      if (a.length === 0) continue;
      if (haystack.includes(a)) {
        if (a.length > bestAliasLen) bestAliasLen = a.length;
      }
    }
    if (bestAliasLen > 0) hits.push({ vendor: v, aliasLength: bestAliasLen });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.aliasLength - a.aliasLength);
  return { vendor: hits[0].vendor, ambiguous: hits.length > 1 };
}
