"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisClient = void 0;
const redis_1 = require("redis");
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is not set.');
}
const redisClient = (0, redis_1.createClient)({
    url: redisUrl,
});
exports.redisClient = redisClient;
redisClient.on('error', (err) => console.error('Redis Client Error', err));
// Connect to Redis. This is an async operation.
// We use a self-invoking async function to handle the top-level await.
(async () => {
    try {
        await redisClient.connect();
        console.log('Successfully connected to Redis.');
    }
    catch (err) {
        console.error('Failed to connect to Redis:', err);
        // Exit the process if Redis connection fails, as it's critical.
        process.exit(1);
    }
})();
