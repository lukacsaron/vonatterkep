import { Train } from '@/types';

/** Matches STALE_TRAIN_DATA_THRESHOLD_SECONDS used by /api/health. */
export const STALE_AFTER_SECONDS = 10 * 60;

export interface DataFreshness {
  isStale: boolean;
  ageSeconds: number | null;
  /** Hungarian, human readable, e.g. "3 perce" or "434 napja". */
  label: string | null;
}

function hungarianAge(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'kevesebb mint egy perce';
  if (minutes < 60) return `${minutes} perce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} órája`;
  const days = Math.floor(hours / 24);
  return `${days} napja`;
}

/**
 * Every train carries lastUpdate, so freshness can be derived client side
 * without another request. The map used to render whatever the cache held -
 * positions frozen for over a year were drawn exactly like live ones.
 */
export function getDataFreshness(trains: Train[] | undefined): DataFreshness {
  if (!trains || trains.length === 0) {
    return { isStale: false, ageSeconds: null, label: null };
  }

  let newest = 0;
  for (const train of trains) {
    const raw = (train as { lastUpdate?: string }).lastUpdate;
    if (!raw) continue;
    const t = Date.parse(raw);
    if (!Number.isNaN(t) && t > newest) newest = t;
  }
  if (newest === 0) return { isStale: false, ageSeconds: null, label: null };

  const ageSeconds = Math.max(0, Math.round((Date.now() - newest) / 1000));
  return {
    isStale: ageSeconds > STALE_AFTER_SECONDS,
    ageSeconds,
    label: hungarianAge(ageSeconds),
  };
}
