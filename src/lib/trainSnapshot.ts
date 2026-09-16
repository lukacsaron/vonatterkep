/**
 * Staleness guard and last-good snapshot for live train data.
 *
 * Fetching and serving used to be coupled through a single Redis hash: the worker
 * wrote `trains:live`, /api/trains read it, and nothing in between asked how old
 * the contents were. When upstream went away the hash simply stopped changing and
 * the map kept drawing the last positions it had - for 434 days - as if they were
 * live. Removing a train only ever happened when it DISAPPEARED from the feed, so
 * a train that stayed present with a frozen timestamp was immortal.
 *
 * Two rules fix that, and both live here so the worker and the route agree:
 *
 *   1. A vehicle older than WORKER_VEHICLE_MAX_AGE_MS is never served, whatever
 *      store it came out of.
 *   2. Serving is decoupled from fetching. Every successful cycle writes a
 *      timestamped snapshot; the read path prefers the live hash and falls back to
 *      that snapshot, and when neither is inside the threshold it serves nothing.
 *
 * An empty map that says "no data" is correct. A map of year-old positions is not.
 *
 * Everything below is pure except the Redis key names: no Redis import, no I/O, no
 * clock reads that the caller cannot override. That is deliberate - the decision
 * logic is the part worth testing, and it must be testable without a server.
 */

/** Redis HASH the worker writes each cycle, keyed by gtfsId. */
export const TRAIN_HASH_KEY = 'trains:live';
/** Legacy string key, 60s TTL, kept for backward compatibility. */
export const TRAIN_LEGACY_CACHE_KEY = 'cache:trains:live';
/** Last known-good full payload, written only after a SUCCESSFUL fetch cycle. */
export const TRAIN_SNAPSHOT_KEY = 'trains:snapshot:latest';

/**
 * How old a single vehicle's own `lastUpdate` may be before we refuse to serve it.
 * 120 minutes matches megisholavonat's `should_remove`, and is deliberately far
 * looser than the 10 minute alerting threshold in trainFreshness.ts: that one says
 * "the worker is late, shout about it", this one says "this position is fiction,
 * drop it". Override with WORKER_VEHICLE_MAX_AGE_MS (milliseconds).
 */
const DEFAULT_VEHICLE_MAX_AGE_MS = 120 * 60 * 1000;

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`Ignoring invalid ${name}="${raw}"; using ${fallback}`);
    return fallback;
  }
  return parsed;
}

export const WORKER_VEHICLE_MAX_AGE_MS = positiveIntFromEnv(
  'WORKER_VEHICLE_MAX_AGE_MS',
  DEFAULT_VEHICLE_MAX_AGE_MS
);

/**
 * TTL on the snapshot key. Redis expiring it at the same age we refuse to serve it
 * means a fossil cannot outlive the rule even if the read-path check is bypassed.
 */
export const SNAPSHOT_TTL_SECONDS = Math.ceil(WORKER_VEHICLE_MAX_AGE_MS / 1000);

/**
 * The redis client retries internally, so an unreachable server makes a command
 * hang rather than reject. Time-box every read or /api/trains becomes a black hole.
 */
export const REDIS_READ_TIMEOUT_MS = positiveIntFromEnv('TRAINS_REDIS_TIMEOUT_MS', 2000);

/** Anything carrying the timestamp we age-check. Train satisfies this. */
export interface TimestampedTrain {
  lastUpdate?: string | number | Date | null;
}

export interface TrainSnapshot {
  /** ISO timestamp of the fetch cycle that produced this payload. */
  generatedAt: string;
  /** Number of trains in `trains`, stored so a reader need not parse to count. */
  count: number;
  trains: unknown[];
}

export type TrainDataSource = 'live' | 'snapshot' | 'none';
export type TrainDataStore = 'hash' | 'legacy' | 'snapshot' | 'none';

export interface TrainReadInput {
  /** Values of the live hash: raw JSON strings, or the hash object itself. */
  hashEntries?: string[] | Record<string, string> | null;
  /** Raw value of the legacy string key (a JSON array). */
  legacyCache?: string | null;
  /** Raw value of the snapshot key (a JSON TrainSnapshot). */
  snapshot?: string | null;
  /** Defaults to Date.now(); injectable so tests do not depend on wall clock. */
  nowMs?: number;
  /** Defaults to WORKER_VEHICLE_MAX_AGE_MS. */
  maxAgeMs?: number;
}

export interface TrainReadResult {
  /** What to serve. Never contains anything older than maxAgeMs. */
  trains: unknown[];
  source: TrainDataSource;
  store: TrainDataStore;
  /** Age of the newest position served, in seconds. null when nothing is served. */
  ageSeconds: number | null;
  /** Snapshot generation time when serving a snapshot, else the newest lastUpdate. */
  generatedAt: string | null;
  /** Entries thrown away for being too old, unparsable or undated. */
  droppedStale: number;
  maxAgeSeconds: number;
  /** One line for a log or an X-Data-Reason header. */
  reason: string;
}

/** Accepts the ISO string a JSON round-trip leaves behind, a Date, or epoch ms. */
export function parseTrainTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export interface FreshFilterResult<T> {
  fresh: T[];
  dropped: number;
  /** Newest lastUpdate among the KEPT trains. */
  newestMs: number | null;
}

/**
 * Keep only vehicles whose own timestamp is inside the window.
 *
 * A train with no usable timestamp is dropped: it cannot be shown to be current,
 * and "cannot prove it is fresh" is exactly the case that produced a year of
 * fossils. A timestamp in the future is kept - clock skew on the upstream host is
 * not the vehicle's fault and it is not the stale case we are guarding.
 */
export function filterFreshTrains<T extends TimestampedTrain>(
  trains: T[],
  nowMs: number,
  maxAgeMs: number
): FreshFilterResult<T> {
  const fresh: T[] = [];
  let dropped = 0;
  let newestMs: number | null = null;

  for (const train of trains) {
    const ts = parseTrainTimestamp(train?.lastUpdate);
    if (ts === null || nowMs - ts > maxAgeMs) {
      dropped++;
      continue;
    }
    fresh.push(train);
    if (newestMs === null || ts > newestMs) newestMs = ts;
  }

  return { fresh, dropped, newestMs };
}

/** The payload the worker writes to TRAIN_SNAPSHOT_KEY after a good cycle. */
export function buildSnapshot(trains: unknown[], generatedAt: Date = new Date()): TrainSnapshot {
  return {
    generatedAt: generatedAt.toISOString(),
    count: trains.length,
    trains,
  };
}

/** Tolerant parse: a corrupt or shape-shifted snapshot is treated as absent. */
export function parseSnapshot(raw: string | null | undefined): TrainSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TrainSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.trains)) return null;
    if (typeof parsed.generatedAt !== 'string') return null;
    return {
      generatedAt: parsed.generatedAt,
      count: typeof parsed.count === 'number' ? parsed.count : parsed.trains.length,
      trains: parsed.trains,
    };
  } catch {
    return null;
  }
}

function parseJsonEntries(entries: string[]): { trains: TimestampedTrain[]; corrupt: number } {
  const trains: TimestampedTrain[] = [];
  let corrupt = 0;
  for (const raw of entries) {
    try {
      trains.push(JSON.parse(raw) as TimestampedTrain);
    } catch {
      corrupt++;
    }
  }
  return { trains, corrupt };
}

function toEntryArray(hashEntries: TrainReadInput['hashEntries']): string[] {
  if (!hashEntries) return [];
  if (Array.isArray(hashEntries)) return hashEntries;
  return Object.values(hashEntries);
}

function secondsSince(nowMs: number, thenMs: number): number {
  return Math.max(0, Math.round((nowMs - thenMs) / 1000));
}

/**
 * Decide what /api/trains serves. Pure: give it raw Redis values, get back the
 * payload plus the provenance to report in headers.
 *
 * Order of preference:
 *   1. live hash, filtered per vehicle
 *   2. legacy string key (same cycle wrote it, 60s TTL), filtered per vehicle
 *   3. snapshot, only if generatedAt is inside the window, filtered per vehicle
 *   4. nothing - an empty array, honestly labelled
 */
export function selectTrainPayload(input: TrainReadInput): TrainReadResult {
  const nowMs = input.nowMs ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? WORKER_VEHICLE_MAX_AGE_MS;
  const maxAgeSeconds = Math.round(maxAgeMs / 1000);
  let droppedStale = 0;

  const empty = (reason: string): TrainReadResult => ({
    trains: [],
    source: 'none',
    store: 'none',
    ageSeconds: null,
    generatedAt: null,
    droppedStale,
    maxAgeSeconds,
    reason,
  });

  // 1. Live hash.
  const hashEntries = toEntryArray(input.hashEntries);
  if (hashEntries.length > 0) {
    const { trains, corrupt } = parseJsonEntries(hashEntries);
    const { fresh, dropped, newestMs } = filterFreshTrains(trains, nowMs, maxAgeMs);
    droppedStale += dropped + corrupt;
    if (fresh.length > 0 && newestMs !== null) {
      return {
        trains: fresh,
        source: 'live',
        store: 'hash',
        ageSeconds: secondsSince(nowMs, newestMs),
        generatedAt: new Date(newestMs).toISOString(),
        droppedStale,
        maxAgeSeconds,
        reason:
          dropped + corrupt > 0
            ? `live hash: ${fresh.length} fresh, ${dropped + corrupt} stale/unusable dropped`
            : `live hash: ${fresh.length} fresh`,
      };
    }
  }

  // 2. Legacy string key. Written by the same cycle as the hash and TTL'd to 60s,
  //    so it is still "live" data, just a different store.
  if (input.legacyCache) {
    try {
      const parsed = JSON.parse(input.legacyCache) as unknown;
      if (Array.isArray(parsed)) {
        const { fresh, dropped, newestMs } = filterFreshTrains(
          parsed as TimestampedTrain[],
          nowMs,
          maxAgeMs
        );
        droppedStale += dropped;
        if (fresh.length > 0 && newestMs !== null) {
          return {
            trains: fresh,
            source: 'live',
            store: 'legacy',
            ageSeconds: secondsSince(nowMs, newestMs),
            generatedAt: new Date(newestMs).toISOString(),
            droppedStale,
            maxAgeSeconds,
            reason: `legacy string cache: ${fresh.length} fresh`,
          };
        }
      }
    } catch {
      // Corrupt legacy value is not worth failing over; fall through to snapshot.
    }
  }

  // 3. Last known-good snapshot.
  const snapshot = parseSnapshot(input.snapshot);
  if (snapshot) {
    const generatedMs = parseTrainTimestamp(snapshot.generatedAt);
    if (generatedMs === null) {
      return empty('snapshot has an unparsable generatedAt; serving nothing');
    }
    const snapshotAge = nowMs - generatedMs;
    if (snapshotAge > maxAgeMs) {
      droppedStale += snapshot.trains.length;
      return empty(
        `snapshot is ${secondsSince(nowMs, generatedMs)}s old (limit ${maxAgeSeconds}s); serving nothing`
      );
    }
    // Per-vehicle check as well: a snapshot inside the window can still contain an
    // individual vehicle that was already ageing when it was taken.
    const { fresh, dropped, newestMs } = filterFreshTrains(
      snapshot.trains as TimestampedTrain[],
      nowMs,
      maxAgeMs
    );
    droppedStale += dropped;
    if (fresh.length > 0) {
      return {
        trains: fresh,
        source: 'snapshot',
        store: 'snapshot',
        // Age of the snapshot itself is the honest number to report: it is how
        // long ago we last heard anything at all from upstream.
        ageSeconds: secondsSince(nowMs, newestMs !== null ? Math.max(newestMs, generatedMs) : generatedMs),
        generatedAt: snapshot.generatedAt,
        droppedStale,
        maxAgeSeconds,
        reason: `live data unusable; serving snapshot from ${snapshot.generatedAt} (${fresh.length} trains)`,
      };
    }
    return empty('snapshot contains no vehicle inside the freshness window');
  }

  const snapshotState = input.snapshot ? 'snapshot unreadable' : 'no snapshot';
  if (hashEntries.length > 0) {
    return empty(`live hash held ${hashEntries.length} entr(ies), all stale; ${snapshotState}`);
  }
  return empty(`no usable live data; ${snapshotState}`);
}

/**
 * Which hash fields are no longer servable. Pure - the caller does the deleting.
 *
 * An entry that cannot be parsed, or that carries no usable timestamp, counts as
 * stale: it cannot be shown to be current, and "cannot prove it is fresh" is
 * exactly the case that produced a year of fossils.
 */
export function findStaleHashFields(
  hash: Record<string, string>,
  nowMs: number,
  maxAgeMs: number
): string[] {
  const stale: string[] = [];
  for (const [field, raw] of Object.entries(hash || {})) {
    let timestamp: number | null = null;
    try {
      timestamp = parseTrainTimestamp((JSON.parse(raw) as { lastUpdate?: unknown })?.lastUpdate);
    } catch {
      stale.push(field);
      continue;
    }
    if (timestamp === null || nowMs - timestamp > maxAgeMs) stale.push(field);
  }
  return stale;
}

/** The slice of a Redis client pruning needs, so it can be driven from a test. */
export interface PruneRedisClient {
  hGetAll: (key: string) => Promise<Record<string, string>>;
  multi: () => { hDel: (key: string, field: string) => unknown; exec: () => Promise<unknown> };
}

export interface PruneResult {
  pruned: number;
  remaining: number;
}

/**
 * Delete vehicles that went stale in place.
 *
 * The worker only ever removed trains that DISAPPEARED from the feed, so a train
 * that stayed present with a frozen timestamp - or every train, once the fetch
 * cycle started failing - lived forever. Running this after every cycle drains the
 * hash within the freshness window instead of leaving fossils for /api/trains and
 * the socket push to serve. Makes no upstream calls.
 */
export async function pruneStaleVehicles(
  client: PruneRedisClient,
  key: string = TRAIN_HASH_KEY,
  nowMs: number = Date.now(),
  maxAgeMs: number = WORKER_VEHICLE_MAX_AGE_MS
): Promise<PruneResult> {
  const hash: Record<string, string> = (await client.hGetAll(key)) || {};
  const total = Object.keys(hash).length;
  if (total === 0) return { pruned: 0, remaining: 0 };

  const staleFields = findStaleHashFields(hash, nowMs, maxAgeMs);
  if (staleFields.length === 0) return { pruned: 0, remaining: total };

  const pipeline = client.multi();
  for (const field of staleFields) {
    pipeline.hDel(key, field);
  }
  await pipeline.exec();

  return { pruned: staleFields.length, remaining: total - staleFields.length };
}

/** Rejects instead of hanging when Redis is unreachable. */
export function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}
