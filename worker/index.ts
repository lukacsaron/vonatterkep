// Load .env file FIRST before any imports
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: '.env.local' });
}

import { mavApi, VonatinfoHttpError } from '../src/lib/api/mav';
import { transformMavTrain } from '../src/lib/api/transformers';
import { Train } from '../src/types';
import {
  DEFAULT_IDENTITY_BUDGET,
  DEFAULT_IDENTITY_TTL_SECONDS,
  enrichTrainIdentities,
  formatEnrichmentSummary,
  redisIdentityStore,
} from '../src/lib/trains/identityEnrichment';
import { findStationByName, isGtfsRefreshDue, loadGtfsIndex, refreshGtfsStations } from '../src/lib/gtfs/stations';
import {
  SNAPSHOT_TTL_SECONDS,
  TRAIN_SNAPSHOT_KEY,
  WORKER_VEHICLE_MAX_AGE_MS,
  buildSnapshot,
  filterFreshTrains,
  pruneStaleVehicles,
} from '../src/lib/trainSnapshot';

// Dynamic import of redisClient after environment is loaded
const { redisClient } = require('../src/lib/redis');

const FETCH_INTERVAL_MS = parseInt(process.env.WORKER_FETCH_INTERVAL_MS || '60000', 10);
const CACHE_KEY = 'cache:trains:live';
const HASH_KEY = 'trains:live';
const CACHE_TTL_SECONDS = 60;
const VEHICLE_MAX_AGE_MINUTES = Math.round(WORKER_VEHICLE_MAX_AGE_MS / 60000);

function nonNegativeIntFromEnv(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// Train identity (category, name, line) costs one vonatinfo TRAIN request per
// train. MÁV has IP-blocked this server once for request volume, so this is a
// hard per-cycle cap; 0 turns enrichment requests off (cached identity is
// still applied).
const IDENTITY_BUDGET = nonNegativeIntFromEnv('WORKER_IDENTITY_BUDGET', DEFAULT_IDENTITY_BUDGET);
const IDENTITY_TTL_SECONDS = nonNegativeIntFromEnv('WORKER_IDENTITY_TTL_SECONDS', DEFAULT_IDENTITY_TTL_SECONDS) || DEFAULT_IDENTITY_TTL_SECONDS;
const identityStore = redisIdentityStore(redisClient);



const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function bearingDegrees(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLon = toRad(bLon - aLon);
  const y = Math.sin(dLon) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Below this the sample is noise, not movement. */
const MIN_MOVE_METERS = 50;
/** Guards against absurd values from a long gap or a bad fix. */
const MAX_PLAUSIBLE_KMH = 250;

/**
 * Fill in heading and speed by comparing each train with its previous position.
 * A train that has not moved keeps its last heading rather than snapping north.
 */
function applyDerivedMotion(trains: Train[], previousById: Record<string, string>): void {
  let derived = 0;
  for (const train of trains) {
    const key = train.gtfsId;
    const pos = train.position;
    if (!key || !pos) continue;

    let prev: Train | undefined;
    try {
      prev = previousById[key] ? (JSON.parse(previousById[key]) as Train) : undefined;
    } catch {
      prev = undefined;
    }
    const prevPos = prev?.position;
    const prevAt = prev?.lastUpdate ? Date.parse(prev.lastUpdate as unknown as string) : NaN;

    if (!prevPos) continue;

    const metres = haversineMeters(prevPos.latitude, prevPos.longitude, pos.latitude, pos.longitude);
    if (metres < MIN_MOVE_METERS) {
      // Stationary: keep the last known heading so the arrow does not reset.
      if (typeof prev?.heading === 'number' && prev.heading !== 0) train.heading = prev.heading;
      train.speed = 0;
      continue;
    }

    train.heading = (bearingDegrees(prevPos.latitude, prevPos.longitude, pos.latitude, pos.longitude) + 360) % 360;

    const elapsedSec = Number.isFinite(prevAt) ? (Date.now() - prevAt) / 1000 : NaN;
    if (Number.isFinite(elapsedSec) && elapsedSec > 0) {
      const kmh = (metres / elapsedSec) * 3.6;
      if (kmh <= MAX_PLAUSIBLE_KMH) train.speed = Math.round(kmh);
    }
    derived += 1;
  }
  if (derived > 0) console.log(`\u{1F9ED} Derived heading/speed for ${derived} moving train(s)`);
}

async function runFetchCycle(): Promise<boolean> {
  console.log('Starting MÁV data fetch cycle...');
  try {
    // 1. Fetch raw data from MÁV
    const mavTrains = await mavApi.getTrainPositions();
    
    // 2. Filter trains with GPS data
    const validTrains = mavTrains.filter(train => train.UtolsoGPS);
    console.log(`📍 Found ${validTrains.length} trains with GPS data`);
    
    // 3. Transform. Origin and destination come from vonatinfo's @Relation and
    // get their GTFS id and coordinates by name. This used to fetch each train's
    // whole trip (8 a cycle, ~480 requests/hour) just to read its first and last
    // stop - which covered only a third of the fleet and logged a line per train
    // per cycle. The slide-in still fetches the full trip on demand.
    let gtfsIndex: Awaited<ReturnType<typeof loadGtfsIndex>> = null;
    try {
      gtfsIndex = await loadGtfsIndex(redisClient);
    } catch (err) {
      console.warn('GTFS station index unavailable this cycle:', err);
    }
    const trains: Train[] = validTrains.map(mavTrain => {
      const train = transformMavTrain(mavTrain);
      if (gtfsIndex) {
        for (const end of ['origin', 'destination'] as const) {
          const station = train[end] && findStationByName(gtfsIndex.byName, train[end]!.name);
          if (station) train[end] = { ...train[end]!, id: station.id, coordinates: station.coordinates };
        }
      }
      return train;
    });
    const withCoords = trains.filter(t => t.origin?.coordinates && t.destination?.coordinates).length;
    console.log(`\u{1F5FA}\uFE0F Endpoints: ${withCoords}/${trains.length} trains have both ends located via GTFS`);

    // Category, name and line: cached per ElviraID and applied to every train,
    // plus at most IDENTITY_BUDGET new TRAIN lookups this cycle. Best effort -
    // a failure here never costs the positions.
    if (trains.length > 0) {
      try {
        const stats = await enrichTrainIdentities(trains, identityStore, {
          budget: IDENTITY_BUDGET,
          ttlSeconds: IDENTITY_TTL_SECONDS,
          fetchIdentity: elviraId => mavApi.getTrainIdentity(elviraId),
          isRateLimitError: error => error instanceof VonatinfoHttpError && error.isRateLimit,
        });
        console.log(formatEnrichmentSummary(stats));
      } catch (error) {
        console.warn('Train identity enrichment skipped this cycle:', error instanceof Error ? error.message : error);
      }
    }

    const trainsWithRoute = trains.filter(t => t.origin && t.destination);
    console.log(`🗺️ Worker: ${trainsWithRoute.length}/${trains.length} trains have origin/destination data`);

    if (trainsWithRoute.length > 0) {
      console.log('🚂 Sample routes detected:', trainsWithRoute.slice(0, 3).map(t => ({
        number: t.number,
        route: `${t.origin?.name} -> ${t.destination?.name}`
      })));
    }
      
    if (trains.length === 0) {
        console.warn('MÁV API returned 0 trains. Cache will not be updated.');
        return false;
    }

    // Never publish a vehicle whose own fix is already ancient. The feed normally
    // stamps every train with the fetch instant, so this drops nothing - but if
    // upstream ever starts replaying old positions, they stop here rather than
    // being rendered as live.
    const { fresh: freshTrains, dropped: staleFromFeed } = filterFreshTrains(
      trains,
      Date.now(),
      WORKER_VEHICLE_MAX_AGE_MS
    );
    if (staleFromFeed > 0) {
      console.warn(
        `⚠️ Dropped ${staleFromFeed}/${trains.length} train(s) with a lastUpdate older than ` +
        `${VEHICLE_MAX_AGE_MINUTES} min (or no usable timestamp)`
      );
    }
    if (freshTrains.length === 0) {
      console.warn(
        `MÁV API returned ${trains.length} train(s) but none inside the ${VEHICLE_MAX_AGE_MINUTES} min ` +
        'freshness window. Treating the cycle as failed.'
      );
      return false;
    }

    // 3. Write to Redis cache using HASH for better performance
    // vonatinfo reports position and delay but no heading or speed, so markers
    // would all point due north at 0 km/h. Derive both from the previous sample.
    let previousById: Record<string, string> = {};
    try {
      previousById = (await redisClient.hGetAll(HASH_KEY)) || {};
    } catch (err) {
      console.warn('Could not read previous train state for heading/speed:', err);
    }
    applyDerivedMotion(freshTrains, previousById);

    // First, get current train IDs to clean up removed trains
    const currentTrainIds = Object.keys(previousById);

    // Trains without a usable gtfsId cannot be used as a Redis hash field and
    // make hSet throw "Cannot convert undefined or null to object", which kills
    // the whole fetch cycle. Drop them rather than losing the cycle.
    const trainsWithValidIds = freshTrains.filter(
      t => t.gtfsId && typeof t.gtfsId === 'string' && t.gtfsId.trim() !== ''
    );
    const skipped = freshTrains.length - trainsWithValidIds.length;
    if (skipped > 0) {
      console.warn(`\u26a0\ufe0f Skipping ${skipped} train(s) without a valid gtfsId`);
    }
    if (trainsWithValidIds.length === 0) {
      console.warn('No trains with valid gtfsId found. Keeping previous cache.');
      return false;
    }

    const newTrainIds = new Set(trainsWithValidIds.map(t => t.gtfsId));
    
    // Prepare pipeline for atomic operations
    const pipeline = redisClient.multi();
    
    // Add/update all trains in the HASH
    for (const train of trainsWithValidIds) {
      pipeline.hSet(HASH_KEY, train.gtfsId, JSON.stringify(train));
    }
    
    // Remove trains that are no longer in the response
    for (const oldId of currentTrainIds) {
      if (!newTrainIds.has(oldId)) {
        pipeline.hDel(HASH_KEY, oldId);
      }
    }
    
    // Execute all operations atomically
    await pipeline.exec();
    
    // 4. Also update the legacy cache key for backward compatibility
    const jsonData = JSON.stringify(freshTrains);
    await redisClient.set(CACHE_KEY, jsonData, {
      EX: CACHE_TTL_SECONDS,
    });

    // 5. Write the last known-good snapshot. This is the point of the whole
    // exercise: serving is now decoupled from fetching, so an upstream outage
    // degrades to "here is what we had at 14:03" instead of silently ageing the
    // live hash. Only a SUCCESSFUL cycle gets here, so the snapshot is never
    // overwritten with a partial or empty result. A snapshot failure is logged,
    // not fatal - the live hash is already written and the cycle did its job.
    try {
      const snapshot = buildSnapshot(trainsWithValidIds);
      await redisClient.set(TRAIN_SNAPSHOT_KEY, JSON.stringify(snapshot), {
        EX: SNAPSHOT_TTL_SECONDS,
      });
      console.log(
        `\u{1F4F8} Snapshot ${TRAIN_SNAPSHOT_KEY}: ${snapshot.count} trains @ ${snapshot.generatedAt} ` +
        `(expires in ${SNAPSHOT_TTL_SECONDS}s)`
      );
    } catch (snapshotError) {
      console.warn('Failed to write train snapshot:', snapshotError);
    }

    // 6. Publish update notification

    console.log(`Successfully cached ${trainsWithValidIds.length} trains and published update.`);
    return true;

  } catch (error) {
    console.error('An error occurred during the fetch cycle:', error);
    // Do not re-throw; we want the worker to continue running for the next cycle.
    return false;
  }
}

// --- Main Execution ---
// Back off when upstream is unhappy. A fixed interval meant that once MÁV started
// rate-limiting us we kept re-tripping the limit every cycle and never recovered.
const MAX_BACKOFF_MS = parseInt(process.env.WORKER_MAX_BACKOFF_MS || '1800000', 10); // 30 min
let consecutiveFailures = 0;

function nextDelayMs(): number {
  if (consecutiveFailures === 0) return FETCH_INTERVAL_MS;
  const backoff = FETCH_INTERVAL_MS * Math.pow(2, consecutiveFailures);
  // Jitter so a restart loop cannot synchronise into a thundering herd.
  const jitter = Math.floor(Math.random() * 5000);
  return Math.min(backoff, MAX_BACKOFF_MS) + jitter;
}

async function scheduleNextCycle() {
  let ok = false;
  try {
    ok = await runFetchCycle();
  } catch (err) {
    console.error('Unhandled error escaping fetch cycle:', err);
  }

  // Runs whether or not the fetch succeeded - a failed cycle is exactly when the
  // hash needs draining, and that is the case the old code never handled.
  try {
    const { pruned, remaining } = await pruneStaleVehicles(redisClient, HASH_KEY);
    if (pruned > 0) {
      console.warn(
        `\u{1F9F9} Pruned ${pruned} vehicle(s) older than ${VEHICLE_MAX_AGE_MINUTES} min from ${HASH_KEY} ` +
        `(${remaining} left)`
      );
    }
  } catch (err) {
    console.warn('Stale vehicle prune failed:', err);
  }

  if (ok) {
    if (consecutiveFailures > 0) {
      console.log(`\u2705 Upstream recovered after ${consecutiveFailures} failed cycle(s).`);
    }
    consecutiveFailures = 0;
  } else {
    consecutiveFailures += 1;
  }

  const delay = nextDelayMs();
  if (consecutiveFailures > 0) {
    console.warn(
      `\u23f8\ufe0f ${consecutiveFailures} consecutive failed cycle(s); next attempt in ${Math.round(delay / 1000)}s ` +
      `(backing off - MÁV rate-limits per host).`
    );
  }
  setTimeout(scheduleNextCycle, delay);
}

console.log(
  `Background worker started. Base interval ${FETCH_INTERVAL_MS / 1000}s, ` +
  `vehicle max age ${VEHICLE_MAX_AGE_MINUTES} min (snapshot -> ${TRAIN_SNAPSHOT_KEY}), ` +
  `identity lookups ${IDENTITY_BUDGET}/cycle cached ${Math.round(IDENTITY_TTL_SECONDS / 3600)} h.`
);

// Wait a bit for Redis connection to establish, then start
setTimeout(() => {
  console.log('Starting initial fetch cycle...');
  scheduleNextCycle();
}, 2000);

// --- GTFS station list -------------------------------------------------------
// MÁV regenerates its GTFS feed nightly. Check hourly with a conditional request:
// an unchanged file costs a bodyless 304, a new one is picked up within the hour
// of being published, and a failed check simply retries next hour. If the server
// stops honouring conditional requests this falls back to one download a day.
const GTFS_CHECK_INTERVAL_MS = 60 * 60 * 1000;
let gtfsCredentialsWarned = false;

async function refreshGtfsIfDue(): Promise<void> {
  if (!process.env.MAV_GTFS_USER || !process.env.MAV_GTFS_PASSWORD) {
    if (!gtfsCredentialsWarned) {
      console.warn('MAV_GTFS_USER / MAV_GTFS_PASSWORD not set - station list stays on the fallback source.');
      gtfsCredentialsWarned = true;
    }
    return;
  }
  try {
    if (!(await isGtfsRefreshDue(redisClient))) return;
    const started = Date.now();
    const outcome = await refreshGtfsStations(redisClient);
    if (outcome.result === 'updated') {
      console.log(
        `\u{1F5C2}\uFE0F GTFS stations updated: ${outcome.meta.stationCount} stations, ` +
        `feed ${outcome.meta.feedVersion ?? 'unknown'}, ${Date.now() - started} ms`
      );
    } else if (outcome.reason === 'server-ignored-conditional') {
      console.warn('GTFS server ignored the conditional request - falling back to one full download per day.');
    } else {
      console.log(`GTFS unchanged since ${outcome.meta.lastModified} (HTTP 304).`);
    }
  } catch (error) {
    // The previous list stays in Redis (long TTL), so a failure degrades nothing.
    console.error('GTFS station refresh failed - keeping the previous station list:', error);
  }
}

setTimeout(refreshGtfsIfDue, 10_000);
setInterval(refreshGtfsIfDue, GTFS_CHECK_INTERVAL_MS);