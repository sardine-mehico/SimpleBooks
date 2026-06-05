import { PreconditionFailedException } from '@nestjs/common';

// Build a strong ETag from a row's `updatedAt`. Quotes are required by the
// HTTP spec; some clients strip them so we accept both quoted and unquoted on
// the way in (see assertIfMatch).
export function etagFor(updatedAt: Date | string | null | undefined): string {
  if (!updatedAt) return '"new"';
  const iso = typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString();
  return `"${iso}"`;
}

// Compare an incoming `If-Match` header against the row's current `updatedAt`.
// - No header → permissive (backward-compatible for older clients).
// - Header present but stale → 412 Precondition Failed.
// - Wildcard `*` → matches anything (treats as "I know it exists, just update it").
export function assertIfMatch(
  currentUpdatedAt: Date | string | null | undefined,
  ifMatch: string | undefined | null,
): void {
  if (!ifMatch) return;
  const trimmed = ifMatch.trim();
  if (trimmed === '*') return;
  const expected = etagFor(currentUpdatedAt);
  // Accept quoted or unquoted form.
  const got = trimmed.startsWith('"') ? trimmed : `"${trimmed}"`;
  if (got !== expected) {
    throw new PreconditionFailedException({
      statusCode: 412,
      error: 'Precondition Failed',
      message:
        'This record was modified by another user since you loaded it. Reload and re-apply your changes to avoid overwriting them.',
      expected,
      got,
    });
  }
}
