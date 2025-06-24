// Load .env file only in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv/config');
}
import { mavApi } from '../src/lib/api/mav';
import { transformMavTrain } from '../src/lib/api/transformers';
import { redisClient } from '../src/lib/redis';
import { Train } from '../src/types';

const FETCH_INTERVAL_MS = parseInt(process.env.WORKER_FETCH_INTERVAL_MS || '25000', 10);
const CACHE_KEY = 'cache:trains:live';
const HASH_KEY = 'trains:live';
const CACHE_TTL_SECONDS = 60;
const REDIS_CHANNEL = 'trains:updates';

async function runFetchCycle() {
  console.log('Starting MÁV data fetch cycle...');
  try {
    // 1. Fetch raw data from MÁV
    const mavTrains = await mavApi.getTrainPositions();
    
    // 2. Transform the data
    const trains: Train[] = mavTrains
      .filter(train => train.UtolsoGPS)
      .map(transformMavTrain);
      
    if (trains.length === 0) {
        console.warn('MÁV API returned 0 trains. Cache will not be updated.');
        return;
    }

    // 3. Write to Redis cache using HASH for better performance
    // First, get current train IDs to clean up removed trains
    const currentTrainIds = await redisClient.hKeys(HASH_KEY);
    const newTrainIds = new Set(trains.map(t => t.gtfsId));
    
    // Prepare pipeline for atomic operations
    const pipeline = redisClient.multi();
    
    // Add/update all trains in the HASH
    for (const train of trains) {
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

  } catch (error) {
    console.error('An error occurred during the fetch cycle:', error);
    // Do not re-throw; we want the worker to continue running for the next cycle.
  }
}

// --- Main Execution ---
console.log(`Background worker started. Fetching data every ${FETCH_INTERVAL_MS / 1000} seconds.`);

// Wait a bit for Redis connection to establish, then start
setTimeout(() => {
  console.log('Starting initial fetch cycle...');
  runFetchCycle(); 
  setInterval(runFetchCycle, FETCH_INTERVAL_MS);
}, 2000);