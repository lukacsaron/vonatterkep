import 'dotenv/config'; // Load .env file
import { mavApi } from '../src/lib/api/mav';
import { transformMavTrain } from '../src/lib/api/transformers';
import { redisClient } from '../src/lib/redis';
import { Train } from '../src/types';

const FETCH_INTERVAL_MS = parseInt(process.env.WORKER_FETCH_INTERVAL_MS || '25000', 10);
const CACHE_KEY = 'cache:trains:live';
const CACHE_TTL_SECONDS = 60;

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

    // 3. Write to Redis cache
    const jsonData = JSON.stringify(trains);
    await redisClient.set(CACHE_KEY, jsonData, {
      EX: CACHE_TTL_SECONDS,
    });
    
    console.log(`Successfully fetched and cached ${trains.length} trains.`);

  } catch (error) {
    console.error('An error occurred during the fetch cycle:', error);
    // Do not re-throw; we want the worker to continue running for the next cycle.
  }
}

// --- Main Execution ---
console.log(`Background worker started. Fetching data every ${FETCH_INTERVAL_MS / 1000} seconds.`);

// Run the cycle immediately on start, then set the interval.
runFetchCycle(); 
setInterval(runFetchCycle, FETCH_INTERVAL_MS);