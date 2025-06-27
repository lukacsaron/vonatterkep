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
const HASH_KEY = 'trains:live';
const CACHE_TTL_SECONDS = 60;
const REDIS_CHANNEL = 'trains:updates';
async function runFetchCycle() {
    console.log('Starting MÁV data fetch cycle...');
    try {
        // 1. Fetch raw data from MÁV
        const mavTrains = await mav_1.mavApi.getTrainPositions();
        // 2. Transform the data
        const trains = mavTrains
            .filter(train => train.UtolsoGPS)
            .map(transformers_1.transformMavTrain);
        // Debug locomotive detection in worker
        const trainsWithLocomotive = trains.filter(t => t.locomotiveType);
        console.log(`🚂 Worker: ${trainsWithLocomotive.length}/${trains.length} trains have locomotive detection`);
        if (trainsWithLocomotive.length > 0) {
            console.log('🔍 Sample locomotives detected:', trainsWithLocomotive.slice(0, 3).map(t => {
                var _a, _b;
                return ({
                    number: t.number,
                    type: (_a = t.locomotiveType) === null || _a === void 0 ? void 0 : _a.name,
                    uic: (_b = t.uicInfo) === null || _b === void 0 ? void 0 : _b.rawUIC
                });
            }));
        }
        if (trains.length === 0) {
            console.warn('MÁV API returned 0 trains. Cache will not be updated.');
            return;
        }
        // 3. Write to Redis cache using HASH for better performance
        // First, get current train IDs to clean up removed trains
        const currentTrainIds = await redis_1.redisClient.hKeys(HASH_KEY);
        const newTrainIds = new Set(trains.map(t => t.gtfsId));
        // Prepare pipeline for atomic operations
        const pipeline = redis_1.redisClient.multi();
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
        await redis_1.redisClient.set(CACHE_KEY, jsonData, {
            EX: CACHE_TTL_SECONDS,
        });
        // 5. Publish update notification
        await redis_1.redisClient.publish(REDIS_CHANNEL, 'new-data');
        console.log(`Successfully cached ${trains.length} trains and published update.`);
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
