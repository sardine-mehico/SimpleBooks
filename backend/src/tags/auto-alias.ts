// Pure helpers for the auto-alias pass: given a transaction description and a
// set of active tags (each with name + aliases), compute which tags should
// attach. Substring-match against the description (case-insensitive,
// word-boundary), longest pattern first so "Honda CRV 2006" wins over "CRV".

export type AutoAliasTag = {
  id: string;
  name: string;
  aliases: string[];
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a single match index from all tags. Returns array of
// { tagId, pattern, length } sorted longest-first so a single description scan
// can pick the best match per tag.
export function buildMatchIndex(tags: AutoAliasTag[]): Array<{ tagId: string; pattern: RegExp; length: number }> {
  const entries: Array<{ tagId: string; pattern: RegExp; length: number }> = [];
  for (const tag of tags) {
    const patterns = new Set<string>();
    if (tag.name.trim()) patterns.add(tag.name.trim());
    for (const a of tag.aliases ?? []) {
      const t = a.trim();
      if (t) patterns.add(t);
    }
    for (const p of patterns) {
      // word-boundary on the outside is fragile for patterns containing
      // punctuation (e.g. "amazon.com.au"). Use a softer boundary:
      //   - left: start-of-string or non-alphanumeric
      //   - right: end-of-string or non-alphanumeric
      // Case-insensitive.
      const rx = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(p.toLowerCase())}(?=[^a-z0-9]|$)`, 'i');
      entries.push({ tagId: tag.id, pattern: rx, length: p.length });
    }
  }
  entries.sort((a, b) => b.length - a.length);
  return entries;
}

// Given a description and an index, return the set of tagIds that match.
// Each tag matches at most once (any pattern attributed to that tag firing).
export function findMatchingTagIds(description: string, index: Array<{ tagId: string; pattern: RegExp }>): string[] {
  const desc = description.toLowerCase();
  const hits = new Set<string>();
  for (const entry of index) {
    if (hits.has(entry.tagId)) continue;
    if (entry.pattern.test(desc)) hits.add(entry.tagId);
  }
  return Array.from(hits);
}
