import { budapestTime } from './budapest';

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export function parseClock(hhmm: string | undefined): [number, number] | null {
  const m = hhmm?.trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Budapest wall-clock time `hm` on `base` + `dayOffset` days. */
export function atDay(base: CalendarDate, dayOffset: number, hm: [number, number]): Date {
  return budapestTime(base.year, base.month, base.day + dayOffset, hm[0], hm[1]);
}

/**
 * Place an ACTUAL time on whichever of the three neighbouring days puts it
 * closest to its scheduled time. Handles running early, running late, and
 * delays that cross midnight, without a fixed "12 hour" rule.
 */
export function nearestTo(base: CalendarDate, dayOffset: number, hm: [number, number], scheduled: Date): Date {
  let best = atDay(base, dayOffset, hm);
  for (const k of [dayOffset - 1, dayOffset + 1]) {
    const candidate = atDay(base, k, hm);
    if (Math.abs(candidate.getTime() - scheduled.getTime()) < Math.abs(best.getTime() - scheduled.getTime())) {
      best = candidate;
    }
  }
  return best;
}

/**
 * For a train's stop list: scheduled times are monotonic along the route, so
 * the day rolls forward whenever a scheduled time goes backwards. Actual times
 * never drive the rollover (a train one minute early is not a day earlier).
 */
export function createRouteSequencer(base: CalendarDate) {
  let dayOffset = 0;
  let previousAbs = -1;
  return {
    scheduled(hhmm: string | undefined): { date: Date; dayOffset: number } | undefined {
      const hm = parseClock(hhmm);
      if (!hm) return undefined;
      const minutes = hm[0] * 60 + hm[1];
      if (previousAbs >= 0 && minutes + dayOffset * 1440 < previousAbs) dayOffset += 1;
      previousAbs = minutes + dayOffset * 1440;
      return { date: atDay(base, dayOffset, hm), dayOffset };
    },
    actual(hhmm: string | undefined, scheduled?: { date: Date; dayOffset: number }): Date | undefined {
      const hm = parseClock(hhmm);
      if (!hm) return undefined;
      return scheduled ? nearestTo(base, scheduled.dayOffset, hm, scheduled.date) : atDay(base, dayOffset, hm);
    },
  };
}
