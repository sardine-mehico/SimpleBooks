// backend/src/util/dates.ts
// Convert a date-only string (YYYY-MM-DD) into a JS Date at local-time start/end
// in the given IANA timezone. Avoids the UTC-midnight off-by-one bug documented
// in CLAUDE.md (positive-offset zones round back a day when `new Date(yyyy-mm-dd)`
// is interpreted as UTC midnight).

export function localStartOfDay(yyyy_mm_dd: string, timezone: string): Date {
  return zonedDate(yyyy_mm_dd, '00:00:00', timezone);
}

export function localEndOfDay(yyyy_mm_dd: string, timezone: string): Date {
  // Compute as (start of NEXT day) - 1 millisecond. The naive approach of
  // zonedDate(date, '23:59:59.999') drifts by ~999ms because Intl's
  // second:'2-digit' formatter strips fractional ms, throwing the offset
  // calculation off by a similar amount.
  const next = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDay = next.toISOString().slice(0, 10);
  return new Date(localStartOfDay(nextDay, timezone).getTime() - 1);
}

function zonedDate(date: string, time: string, timezone: string): Date {
  // Construct as UTC, then ask what the wall-clock would read in `timezone`,
  // and subtract that offset to find the true UTC instant that corresponds to
  // local time `date T time` in `timezone`.
  const asUtc = new Date(`${date}T${time}Z`);
  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = tzFormatter.formatToParts(asUtc).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const tzAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offsetMs = tzAsUtc - asUtc.getTime();
  return new Date(asUtc.getTime() - offsetMs);
}
