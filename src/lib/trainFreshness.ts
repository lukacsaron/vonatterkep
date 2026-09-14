import { redisClient } from './redis';

// The background worker refreshes live train positions every ~25 seconds. If the
// newest cached position is older than this, we are serving a frozen snapshot:
// the worker is wedged, MAV is unreachable, or we are being rate limited.
// Production once served train data that was 432 days old and nothing anywhere
// said so - this is the thing that says so.
export const STALE_TRAIN_DATA_THRESHOLD_SECONDS = 10 * 60;

// Every Redis call here is time-boxed. The redis client retries internally, so an
// unreachable server makes a command hang instead of rejecting - that would turn
// /api/health into a black hole and the container healthcheck would time out and
// kill a working container.
export const REDIS_OP_TIMEOUT_MS = 2000;

const TRAIN_HASH_KEY = 'trains:live';
const TRAIN_CACHE_KEY = 'cache:trains:live';

export type FreshnessStatus = 'fresh' | 'stale' | 'no_data' | 'unknown';

export interface TrainDataFreshness {
  status: FreshnessStatus;
  trainCount: number;
  lastUpdate: string | null;
  ageSeconds: number | null;
  age: string;
  staleAfterSeconds: number;
  error?: string;
}

/** Only the bits of the Redis client this module needs, so it can be tested. */
export interface FreshnessRedisClient {
  hGetAll?: (key: string) => Promise<Record<string, string>>;
  get?: (key: string) => Promise<string | null>;
}

function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/** "3 minutes 4 seconds", "432 days 7 hours" - readable at a glance in an alert. */
export function formatAge(totalSeconds: number): string {
  if (totalSeconds < 1) return 'less than a second';

  const units: Array<[string, number]> = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];

  const parts: string[] = [];
  let remaining = Math.floor(totalSeconds);

  for (const [name, size] of units) {
    const value = Math.floor(remaining / size);
    if (value > 0) {
      parts.push(`${value} ${name}${value === 1 ? '' : 's'}`);
      remaining -= value * size;
    }
    if (parts.length === 2) break;
  }

  return parts.join(' ');
}

function newestLastUpdate(serialisedTrains: string[]): { newest: number | null; parsed: number } {
  let newest: number | null = null;
  let parsed = 0;

  for (const raw of serialisedTrains) {
    try {
      const train = JSON.parse(raw) as { lastUpdate?: string | number | null };
      parsed++;
      if (!train.lastUpdate) continue;
      const timestamp = new Date(train.lastUpdate).getTime();
      if (Number.isNaN(timestamp)) continue;
      if (newest === null || timestamp > newest) newest = timestamp;
    } catch {
      // A single corrupt entry must not hide the freshness of the rest.
    }
  }

  return { newest, parsed };
}

/**
 * Age of the newest cached train position.
 *
 * Reads only what the background worker already cached - it makes no upstream MAV
 * calls - is time-boxed on every Redis command, and never throws.
 */
export async function getTrainDataFreshness(
  client: FreshnessRedisClient = redisClient,
  timeoutMs: number = REDIS_OP_TIMEOUT_MS
): Promise<TrainDataFreshness> {
  const base: TrainDataFreshness = {
    status: 'unknown',
    trainCount: 0,
    lastUpdate: null,
    ageSeconds: null,
    age: 'unknown',
    staleAfterSeconds: STALE_TRAIN_DATA_THRESHOLD_SECONDS,
  };

  try {
    let serialised: string[] = [];

    if (typeof client?.hGetAll === 'function') {
      const hash = await withTimeout(
        client.hGetAll(TRAIN_HASH_KEY),
        `Redis hGetAll(${TRAIN_HASH_KEY})`,
        timeoutMs
      );
      serialised = Object.values(hash || {});
    }

    // Fall back to the legacy string cache the worker also writes.
    if (serialised.length === 0 && typeof client?.get === 'function') {
      const cached = await withTimeout(
        client.get(TRAIN_CACHE_KEY),
        `Redis get(${TRAIN_CACHE_KEY})`,
        timeoutMs
      );
      if (cached) {
        const trains = JSON.parse(cached) as unknown[];
        if (Array.isArray(trains)) serialised = trains.map(train => JSON.stringify(train));
      }
    }

    if (serialised.length === 0) {
      return { ...base, status: 'no_data', age: 'no cached train data' };
    }

    const { newest, parsed } = newestLastUpdate(serialised);

    if (newest === null) {
      return { ...base, status: 'unknown', trainCount: parsed, age: 'cached trains carry no lastUpdate' };
    }

    const ageSeconds = Math.max(0, Math.round((Date.now() - newest) / 1000));

    return {
      status: ageSeconds > STALE_TRAIN_DATA_THRESHOLD_SECONDS ? 'stale' : 'fresh',
      trainCount: parsed,
      lastUpdate: new Date(newest).toISOString(),
      ageSeconds,
      age: formatAge(ageSeconds),
      staleAfterSeconds: STALE_TRAIN_DATA_THRESHOLD_SECONDS,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Train data freshness check failed:', message);
    return { ...base, error: message };
  }
}
