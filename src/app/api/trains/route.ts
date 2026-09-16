import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';
import {
  REDIS_READ_TIMEOUT_MS,
  TRAIN_HASH_KEY,
  TRAIN_LEGACY_CACHE_KEY,
  TRAIN_SNAPSHOT_KEY,
  WORKER_VEHICLE_MAX_AGE_MS,
  selectTrainPayload,
  withTimeout,
} from '@/lib/trainSnapshot';

// Live positions are never cacheable at the framework level; the answer depends on
// how old Redis's contents are at this instant.
export const dynamic = 'force-dynamic';

/**
 * Reads never fail the request. A Redis outage or a hung command degrades the
 * source we can use, it does not turn the map into an error page - and a hang has
 * to become an empty answer rather than a request that never returns.
 */
async function readOrNull<T>(label: string, operation: () => Promise<T>): Promise<T | null> {
  try {
    return await withTimeout(operation(), label, REDIS_READ_TIMEOUT_MS);
  } catch (error) {
    console.warn(`${label} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Serve live train positions, or the last known-good snapshot, or nothing.
 *
 * The filtering happens HERE rather than only in the worker on purpose: a wedged or
 * dead worker cannot prune its own output, and this endpoint is what the map reads.
 * Whatever comes back, X-Data-Source and X-Data-Age-Seconds say what it is.
 */
export async function GET() {
  try {
    const [trainHash, snapshotRaw, legacyRaw] = await Promise.all([
      readOrNull(`Redis hGetAll(${TRAIN_HASH_KEY})`, () =>
        redisClient.hGetAll(TRAIN_HASH_KEY) as Promise<Record<string, string>>
      ),
      readOrNull(`Redis get(${TRAIN_SNAPSHOT_KEY})`, () =>
        redisClient.get(TRAIN_SNAPSHOT_KEY) as Promise<string | null>
      ),
      readOrNull(`Redis get(${TRAIN_LEGACY_CACHE_KEY})`, () =>
        redisClient.get(TRAIN_LEGACY_CACHE_KEY) as Promise<string | null>
      ),
    ]);

    const result = selectTrainPayload({
      hashEntries: trainHash,
      snapshot: snapshotRaw,
      legacyCache: legacyRaw,
      maxAgeMs: WORKER_VEHICLE_MAX_AGE_MS,
    });

    if (result.source !== 'live') {
      // Worth a log line every time: this is the state that used to be invisible.
      console.warn(`/api/trains serving ${result.source}: ${result.reason}`);
    } else if (result.droppedStale > 0) {
      console.warn(`/api/trains dropped ${result.droppedStale} stale/unusable train(s): ${result.reason}`);
    }

    return NextResponse.json(result.trains, {
      headers: {
        'X-Data-Source': result.source,
        'X-Data-Store': result.store,
        'X-Data-Age-Seconds': result.ageSeconds === null ? 'unknown' : String(result.ageSeconds),
        'X-Data-Max-Age-Seconds': String(result.maxAgeSeconds),
        'X-Data-Generated-At': result.generatedAt ?? 'unknown',
        'X-Data-Count': String(result.trains.length),
        'X-Data-Dropped-Stale': String(result.droppedStale),
        'X-Data-Reason': result.reason,
        // Kept for anything still reading the old headers.
        'X-Cache-Status': result.source === 'none' ? 'MISS' : 'HIT',
        'X-Cache-Type': result.store.toUpperCase(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error fetching trains from cache:', error);
    return NextResponse.json(
      { error: 'Failed to fetch train data from service cache.' },
      { status: 503 } // 503 Service Unavailable is appropriate here
    );
  }
}
