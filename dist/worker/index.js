"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Load .env file only in development
if (process.env.NODE_ENV !== 'production') {
    require('dotenv/config');
}
const mav_1 = require("../src/lib/api/mav");
const transformers_1 = require("../src/lib/api/transformers");
const redis_1 = require("../src/lib/redis");
const FETCH_INTERVAL_MS = parseInt(process.env.WORKER_FETCH_INTERVAL_MS || '25000', 10);
const CACHE_KEY = 'cache:trains:live';
const CACHE_TTL_SECONDS = 60;
async function runFetchCycle() {
    console.log('Starting MÁV data fetch cycle...');
    try {
        // 1. Fetch raw data from MÁV
        const mavTrains = await mav_1.mavApi.getTrainPositions();
        // 2. Transform the data
        const trains = mavTrains
            .filter(train => train.UtolsoGPS)
            .map(transformers_1.transformMavTrain);
        if (trains.length === 0) {
            console.warn('MÁV API returned 0 trains. Cache will not be updated.');
            return;
        }
        // 3. Write to Redis cache
        const jsonData = JSON.stringify(trains);
        await redis_1.redisClient.set(CACHE_KEY, jsonData, {
            EX: CACHE_TTL_SECONDS,
        });
        console.log(`Successfully fetched and cached ${trains.length} trains.`);
    }
    catch (error) {
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
