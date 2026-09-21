/**
 * Train identity cache and the worker's enrichment budget.
 *
 * The positions feed has no category, name or line; the TRAIN title has all
 * three but costs one upstream request per train. MÁV has IP-blocked this
 * server once already for request volume, so identity is fetched at most
 * `budget` times per worker cycle, only for trains whose identity is not cached,
 * and cached per ElviraID for a day and a half. Cached identities are applied
 * to every train on every cycle at the cost of one Redis MGET.
 *
 * The slide-in routes write here too (writeTrainIdentity): they already make
 * the TRAIN request for the timetable, so a train someone opened costs the
 * worker nothing.
 *
 * Relative imports only (compiled into the worker by plain tsc).
 */
import { Train } from '../../types';
import { applyTrainIdentity, isUsableElviraId, TrainIdentity } from './identity';

/** Redis key prefix. Deliberately outside "trains:*", which cache invalidation deletes. */
export const IDENTITY_KEY_PREFIX = 'vonatinfo:identity:';

/** An ElviraID names one run of one train, so a run's identity never changes; 36 h outlives any run. */
export const DEFAULT_IDENTITY_TTL_SECONDS = 36 * 60 * 60;
/** A failed lookup is retried after this long, not every cycle. */
export const DEFAULT_FAILURE_TTL_SECONDS = 30 * 60;
export const DEFAULT_IDENTITY_BUDGET = 4;
/** After a 403/429 from vonatinfo, no enrichment requests at all for this long. */
export const RATE_LIMIT_PAUSE_MS = 30 * 60 * 1000;
/** Stop starting new lookups once a cycle has spent this long on them. */
export const DEFAULT_MAX_WALL_MS = 20 * 1000;

export const identityKey = (elviraId: string) => `${IDENTITY_KEY_PREFIX}${elviraId}`;

type CachedIdentity =
  | { v: 1; identity: TrainIdentity; at: string }
  | { v: 1; failed: true; at: string };

/** The two Redis operations this needs. Real Redis via redisIdentityStore; tests pass a Map. */
export interface IdentityStore {
  getMany(keys: string[]): Promise<Array<string | null>>;
  set(key: string, value: string, ttlSeconds: number): Promise<unknown>;
}

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  mGet?: (keys: string[]) => Promise<Array<string | null>>;
}

export function redisIdentityStore(client: RedisLike): IdentityStore {
  return {
    async getMany(keys) {
      if (keys.length === 0) return [];
      // The development mock client has no mGet.
      if (typeof client.mGet === 'function') return client.mGet(keys);
      return Promise.all(keys.map(key => client.get(key)));
    },
    set: (key, value, ttlSeconds) => client.set(key, value, { EX: ttlSeconds }),
  };
}

function parseCached(raw: string | null): CachedIdentity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 1) return null;
    if (parsed.failed === true) return parsed;
    if (typeof parsed.identity?.number === 'string') return parsed;
  } catch {
    // unreadable entry: treat as a miss
  }
  return null;
}

/** Store an identity learned elsewhere (the slide-in). Never throws. */
export async function writeTrainIdentity(
  store: IdentityStore,
  elviraId: string | undefined,
  identity: TrainIdentity | undefined,
  ttlSeconds: number = DEFAULT_IDENTITY_TTL_SECONDS
): Promise<void> {
  if (!isUsableElviraId(elviraId) || !identity?.number) return;
  try {
    const entry: CachedIdentity = { v: 1, identity, at: new Date().toISOString() };
    await store.set(identityKey(elviraId), JSON.stringify(entry), ttlSeconds);
  } catch (error) {
    console.warn(`Could not cache identity for ${elviraId}:`, error instanceof Error ? error.message : error);
  }
}

export interface EnrichmentOptions {
  /** One TRAIN request for one ElviraID. null: vonatinfo answered but had no title. */
  fetchIdentity: (elviraId: string) => Promise<TrainIdentity | null>;
  /** Upstream requests allowed this cycle. */
  budget: number;
  ttlSeconds?: number;
  failureTtlSeconds?: number;
  maxWallMs?: number;
  /** Recognises "slow down" answers (403/429). Pauses enrichment when true. */
  isRateLimitError?: (error: unknown) => boolean;
  now?: () => number;
}

export interface EnrichmentStats {
  trains: number;
  /** HÉV: identity comes from the feed alone, never looked up. */
  byRule: number;
  /** Trains whose ElviraID vonatinfo cannot answer for. */
  unusableId: number;
  /** Identity applied from Redis. */
  cached: number;
  /** A recent lookup failed; waiting for the failure marker to expire. */
  recentlyFailed: number;
  /** Upstream TRAIN requests made this cycle. */
  requests: number;
  fetched: number;
  failed: number;
  /** Still unknown after this cycle. */
  pending: number;
  budget: number;
  /** Set when enrichment is paused after a rate-limit answer. */
  pausedUntil?: string;
}

// Process-wide: a 403/429 pauses every later cycle too, not just this one.
let pausedUntil = 0;

/** For tests. */
export function resetEnrichmentPause(): void {
  pausedUntil = 0;
}

/** Longest-running services first: IC/EC/RJ numbers are the short ones. */
function lookupPriority(a: Train, b: Train): number {
  return a.number.length - b.number.length || a.number.localeCompare(b.number, 'hu', { numeric: true });
}

/**
 * Apply cached identities to `trains` (in place) and look up at most
 * `options.budget` unknown ones. Never throws for upstream failures; a Redis
 * read failure propagates (the caller logs it and carries on without identity).
 */
export async function enrichTrainIdentities(
  trains: Train[],
  store: IdentityStore,
  options: EnrichmentOptions
): Promise<EnrichmentStats> {
  const now = options.now ?? Date.now;
  const ttl = options.ttlSeconds ?? DEFAULT_IDENTITY_TTL_SECONDS;
  const failureTtl = options.failureTtlSeconds ?? DEFAULT_FAILURE_TTL_SECONDS;
  const maxWallMs = options.maxWallMs ?? DEFAULT_MAX_WALL_MS;
  const budget = Math.max(0, Math.floor(options.budget));

  const stats: EnrichmentStats = {
    trains: trains.length, byRule: 0, unusableId: 0, cached: 0, recentlyFailed: 0,
    requests: 0, fetched: 0, failed: 0, pending: 0, budget,
  };

  const lookups: Train[] = [];
  for (const train of trains) {
    if (train.operator === 'HEV') stats.byRule += 1;
    else if (!isUsableElviraId(train.gtfsId)) stats.unusableId += 1;
    else lookups.push(train);
  }

  const cachedRaw = await store.getMany(lookups.map(train => identityKey(train.gtfsId!)));
  const misses: Train[] = [];
  lookups.forEach((train, index) => {
    const cached = parseCached(cachedRaw[index] ?? null);
    if (cached && 'identity' in cached) {
      applyTrainIdentity(train, cached.identity);
      stats.cached += 1;
    } else if (cached) {
      stats.recentlyFailed += 1;
    } else {
      misses.push(train);
    }
  });

  misses.sort(lookupPriority);
  const started = now();
  for (const train of misses) {
    if (stats.requests >= budget) break;
    if (pausedUntil > now()) break;
    if (now() - started > maxWallMs) break;

    const elviraId = train.gtfsId!;
    stats.requests += 1;
    try {
      const identity = await options.fetchIdentity(elviraId);
      if (identity?.number) {
        applyTrainIdentity(train, identity);
        await writeTrainIdentity(store, elviraId, identity, ttl);
        stats.fetched += 1;
        continue;
      }
    } catch (error) {
      if (options.isRateLimitError?.(error)) {
        pausedUntil = now() + RATE_LIMIT_PAUSE_MS;
        stats.failed += 1;
        break;
      }
    }
    stats.failed += 1;
    try {
      const marker: CachedIdentity = { v: 1, failed: true, at: new Date(now()).toISOString() };
      await store.set(identityKey(elviraId), JSON.stringify(marker), failureTtl);
    } catch {
      // Not caching a failure only means it is retried sooner.
    }
  }

  stats.pending = misses.length - stats.fetched - stats.failed;
  if (pausedUntil > now()) stats.pausedUntil = new Date(pausedUntil).toISOString();
  return stats;
}

/** The one log line per cycle. */
export function formatEnrichmentSummary(stats: EnrichmentStats): string {
  const known = stats.byRule + stats.cached + stats.fetched;
  const parts = [
    `${known}/${stats.trains} trains identified`,
    `${stats.cached} cached, ${stats.fetched} new, ${stats.byRule} HÉV by rule`,
    `${stats.requests}/${stats.budget} TRAIN request(s)`,
  ];
  if (stats.failed > 0) parts.push(`${stats.failed} failed`);
  if (stats.pending > 0) parts.push(`${stats.pending} still to look up`);
  if (stats.recentlyFailed > 0) parts.push(`${stats.recentlyFailed} waiting to retry`);
  if (stats.unusableId > 0) parts.push(`${stats.unusableId} with an unusable id`);
  if (stats.pausedUntil) parts.push(`PAUSED after a rate-limit answer until ${stats.pausedUntil}`);
  return `Identity: ${parts.join(', ')}`;
}
