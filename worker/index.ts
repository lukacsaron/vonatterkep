// Load .env file FIRST before any imports
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: '.env.local' });
}

import { mavApi } from '../src/lib/api/mav';
import { transformMavTrain } from '../src/lib/api/transformers';
import { Train, TrainDetails } from '../src/types';

// Dynamic import of redisClient after environment is loaded
const { redisClient } = require('../src/lib/redis');

const FETCH_INTERVAL_MS = parseInt(process.env.WORKER_FETCH_INTERVAL_MS || '60000', 10);
const CACHE_KEY = 'cache:trains:live';
const HASH_KEY = 'trains:live';
const ROUTE_CACHE_KEY = 'cache:routes';
const CACHE_TTL_SECONDS = 60;
// A trip's route geometry does not change during the day, so caching it for minutes
// was burning the upstream request budget for nothing.
const ROUTE_CACHE_TTL_SECONDS = parseInt(process.env.WORKER_ROUTE_CACHE_TTL || '86400', 10);
const REDIS_CHANNEL = 'trains:updates';
// MÁV rate-limits per host (it answers 403 with the body "host limit achived").
// At 50 route fetches every 25s this worker issued ~7,300 requests/hour and sat
// permanently inside the penalty window. Keep the per-cycle budget small; the
// route cache fills in over successive cycles instead.
const MAX_ROUTE_FETCHES_PER_CYCLE = parseInt(process.env.WORKER_MAX_ROUTE_FETCHES || '8', 10);

// In-memory cache for route details to avoid excessive Redis operations
const routeCache = new Map<string, { data: TrainDetails; timestamp: number }>();
const ROUTE_CACHE_MEMORY_TTL = parseInt(process.env.WORKER_ROUTE_MEMORY_TTL_MS || '21600000', 10); // 6h

// Helper function to get cached route data
async function getCachedRouteDetails(gtfsId: string): Promise<TrainDetails | null> {
  // Check in-memory cache first
  const memoryEntry = routeCache.get(gtfsId);
  if (memoryEntry && (Date.now() - memoryEntry.timestamp) < ROUTE_CACHE_MEMORY_TTL) {
    return memoryEntry.data;
  }

  // Check Redis cache
  try {
    const cachedRoute = await redisClient.hGet(ROUTE_CACHE_KEY, gtfsId);
    if (cachedRoute) {
      const routeData = JSON.parse(cachedRoute) as TrainDetails;
      // Update in-memory cache
      routeCache.set(gtfsId, { data: routeData, timestamp: Date.now() });
      return routeData;
    }
  } catch (error) {
    console.warn(`Failed to get cached route for ${gtfsId}:`, error);
  }

  return null;
}

// Helper function to cache route data
async function cacheRouteDetails(gtfsId: string, routeData: TrainDetails): Promise<void> {
  try {
    // Cache in Redis
    await redisClient.hSet(ROUTE_CACHE_KEY, gtfsId, JSON.stringify(routeData));
    
    // Set TTL for the entire hash key (this affects all routes in the hash)
    // Note: Redis EXPIRE works on the entire hash, not individual fields
    try {
      await redisClient.expire(ROUTE_CACHE_KEY, ROUTE_CACHE_TTL_SECONDS);
    } catch (expireError) {
      // If expire fails, it's not critical - the data will still be cached
      console.warn(`Failed to set TTL for route cache: ${expireError}`);
    }
    
    // Cache in memory
    routeCache.set(gtfsId, { data: routeData, timestamp: Date.now() });
  } catch (error) {
    console.warn(`Failed to cache route for ${gtfsId}:`, error);
  }
}

// Helper function to fetch route details with caching
async function fetchRouteDetailsWithCache(gtfsId: string): Promise<TrainDetails | null> {
  console.log(`🔄 Fetching route details for ${gtfsId}`);
  
  // Try cache first
  const cachedRoute = await getCachedRouteDetails(gtfsId);
  if (cachedRoute) {
    console.log(`✅ Cache hit for ${gtfsId}`);
    return cachedRoute;
  }

  console.log(`❌ Cache miss for ${gtfsId}, fetching from API`);
  
  // Fetch from API
  try {
    const routeData = await mavApi.getTrainDetails(gtfsId);
    if (routeData) {
      console.log(`✅ API returned route data for ${gtfsId}: ${routeData.stops.length} stops`);
      await cacheRouteDetails(gtfsId, routeData);
      console.log(`✅ Route data cached for ${gtfsId}`);
      return routeData;
    } else {
      console.log(`⚠️ API returned null for ${gtfsId}`);
    }
  } catch (error) {
    console.warn(`❌ Failed to fetch route details for ${gtfsId}:`, error);
  }

  return null;
}

async function runFetchCycle(): Promise<boolean> {
  console.log('Starting MÁV data fetch cycle...');
  try {
    // 1. Fetch raw data from MÁV
    const mavTrains = await mavApi.getTrainPositions();
    
    // 2. Filter trains with GPS data
    const validTrains = mavTrains.filter(train => train.UtolsoGPS);
    console.log(`📍 Found ${validTrains.length} trains with GPS data`);
    
    // 3. Select trains for route data fetching (priority-based selection)
    const trainsWithGtfsId = validTrains.filter(train => train.gtfsId);
    
    // Prioritize trains that don't have cached route data
    const trainsForRouteData = [];
    const trainsWithoutCache = [];
    const trainsWithCache = [];
    
    for (const train of trainsWithGtfsId) {
      const cachedRoute = await getCachedRouteDetails(train.gtfsId!);
      if (cachedRoute) {
        trainsWithCache.push(train);
      } else {
        trainsWithoutCache.push(train);
      }
    }
    
    // First add trains without cache, then trains with cache (up to limit)
    trainsForRouteData.push(...trainsWithoutCache.slice(0, MAX_ROUTE_FETCHES_PER_CYCLE));
    if (trainsForRouteData.length < MAX_ROUTE_FETCHES_PER_CYCLE) {
      const remaining = MAX_ROUTE_FETCHES_PER_CYCLE - trainsForRouteData.length;
      trainsForRouteData.push(...trainsWithCache.slice(0, remaining));
    }
    
    console.log(`🗺️ Fetching route data for ${trainsForRouteData.length}/${trainsWithGtfsId.length} trains (${trainsWithoutCache.length} uncached, ${trainsWithCache.length} cached)`);
    
    // 4. Fetch route details in parallel with batching
    const ROUTE_BATCH_SIZE = 5; // Fetch routes in smaller batches
    const routeDataMap = new Map<string, TrainDetails>();
    
    for (let i = 0; i < trainsForRouteData.length; i += ROUTE_BATCH_SIZE) {
      const batch = trainsForRouteData.slice(i, i + ROUTE_BATCH_SIZE);
      console.log(`🔄 Processing route batch ${Math.floor(i / ROUTE_BATCH_SIZE) + 1}/${Math.ceil(trainsForRouteData.length / ROUTE_BATCH_SIZE)}`);
      
      const batchPromises = batch.map(async (train) => {
        const routeData = await fetchRouteDetailsWithCache(train.gtfsId!);
        return { gtfsId: train.gtfsId!, routeData };
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.routeData) {
          routeDataMap.set(result.value.gtfsId, result.value.routeData);
          console.log(`✅ Route data cached for ${result.value.gtfsId}: ${result.value.routeData.stops.length} stops`);
        } else if (result.status === 'fulfilled' && !result.value.routeData) {
          console.log(`⚠️ No route data for ${result.value.gtfsId}`);
        } else if (result.status === 'rejected') {
          console.log(`❌ Route fetch failed for batch item:`, result.reason);
        }
      });
      
      // Brief pause between batches to be nice to the API
      if (i + ROUTE_BATCH_SIZE < trainsForRouteData.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`✅ Successfully fetched route data for ${routeDataMap.size} trains`);
    console.log('🔍 Route data map keys:', Array.from(routeDataMap.keys()).slice(0, 5));
    
    // 5. Transform the data with route information
    const trains: Train[] = await Promise.all(validTrains.map(async mavTrain => {
      let routeData = mavTrain.gtfsId ? routeDataMap.get(mavTrain.gtfsId) : undefined;
      
      // If not in fresh fetch, check cache
      if (!routeData && mavTrain.gtfsId) {
        routeData = await getCachedRouteDetails(mavTrain.gtfsId) || undefined;
      }
      
      if (routeData) {
        console.log(`🗺️ Train ${mavTrain.VonatSzam} (gtfsId: ${mavTrain.gtfsId}) has route data with ${routeData.stops.length} stops`);
      } else if (mavTrain.gtfsId) {
        console.log(`❌ Train ${mavTrain.VonatSzam} (gtfsId: ${mavTrain.gtfsId}) missing route data`);
      }
      return transformMavTrain(mavTrain, routeData);
    }));
    
    // Debug locomotive detection and route data in worker
    const trainsWithLocomotive = trains.filter(t => t.locomotiveType);
    const trainsWithRoute = trains.filter(t => t.origin && t.destination);
    
    console.log(`🚂 Worker: ${trainsWithLocomotive.length}/${trains.length} trains have locomotive detection`);
    console.log(`🗺️ Worker: ${trainsWithRoute.length}/${trains.length} trains have origin/destination data`);
    
    if (trainsWithLocomotive.length > 0) {
      console.log('🔍 Sample locomotives detected:', trainsWithLocomotive.slice(0, 3).map(t => ({
        number: t.number,
        type: t.locomotiveType?.name,
        uic: t.uicInfo?.rawUIC
      })));
    }
    
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

    // 3. Write to Redis cache using HASH for better performance
    // First, get current train IDs to clean up removed trains
    const currentTrainIds = await redisClient.hKeys(HASH_KEY);

    // Trains without a usable gtfsId cannot be used as a Redis hash field and
    // make hSet throw "Cannot convert undefined or null to object", which kills
    // the whole fetch cycle. Drop them rather than losing the cycle.
    const trainsWithValidIds = trains.filter(
      t => t.gtfsId && typeof t.gtfsId === 'string' && t.gtfsId.trim() !== ''
    );
    const skipped = trains.length - trainsWithValidIds.length;
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
    const jsonData = JSON.stringify(trains);
    await redisClient.set(CACHE_KEY, jsonData, {
      EX: CACHE_TTL_SECONDS,
    });
    
    // 5. Publish update notification
    await redisClient.publish(REDIS_CHANNEL, 'new-data');
    
    console.log(`Successfully cached ${trains.length} trains and published update.`);
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
  `max ${MAX_ROUTE_FETCHES_PER_CYCLE} route fetches/cycle, route cache ${ROUTE_CACHE_TTL_SECONDS}s.`
);

// Wait a bit for Redis connection to establish, then start
setTimeout(() => {
  console.log('Starting initial fetch cycle...');
  scheduleNextCycle();
}, 2000);