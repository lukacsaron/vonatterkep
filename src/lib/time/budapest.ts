/**
 * MÁV publishes wall-clock times in Hungarian local time with no zone attached
 * ("18:32", "2026.09.21."). The server runs in UTC, so building a Date with
 * `new Date(y, m, d)` / `setHours()` silently treats those numbers as UTC and
 * every time lands one or two hours late (CET/CEST). Always go through here.
 *
 * Uses only Intl, so it follows the real Europe/Budapest DST rules.
 */
export const BUDAPEST_TZ = 'Europe/Budapest';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUDAPEST_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function partsAt(ts: number): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const p: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(new Date(ts))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** Offset of Budapest from UTC at the given instant, in ms (+1h or +2h). */
function offsetAt(ts: number): number {
  const p = partsAt(ts);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - ts;
}

/**
 * The instant at which Budapest wall clocks read the given date and time.
 * Day overflow is allowed (day 32, hour 25 ...) and normalises like Date.UTC.
 */
export function budapestTime(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  let ts = asIfUtc - offsetAt(asIfUtc);
  // Across a DST switch the offset at the true instant can differ; one
  // correction step is enough for a 1-hour shift.
  const corrected = asIfUtc - offsetAt(ts);
  if (corrected !== ts) ts = corrected;
  return new Date(ts);
}

/** Today's calendar date as seen in Budapest. */
export function budapestToday(now: Date = new Date()): { year: number; month: number; day: number } {
  const p = partsAt(now.getTime());
  return { year: p.y, month: p.mo, day: p.d };
}

/** "26.09.21" - the date format vonatinfo.mav.hu expects in its requests. */
export function vonatinfoDateParam(date: Date = new Date()): string {
  const p = partsAt(date.getTime());
  const yy = String(p.y % 100).padStart(2, '0');
  return `${yy}.${String(p.mo).padStart(2, '0')}.${String(p.d).padStart(2, '0')}`;
}
