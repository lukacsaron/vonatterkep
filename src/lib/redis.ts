import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;

// Create a mock client for development if Redis URL is not available
const redisClient = redisUrl ? createClient({
  url: redisUrl,
}) : {
  // Mock Redis client for development
  connect: async () => Promise.resolve(),
  get: async () => Promise.resolve(null),
  set: async () => Promise.resolve('OK'),
  on: () => {},
  isReady: false,
} as any;

if (redisUrl) {
  redisClient.on('error', (err: Error) => console.error('Redis Client Error', err));

  // Connect to Redis. This is an async operation.
  // We use a self-invoking async function to handle the top-level await.
  (async () => {
    try {
      await redisClient.connect();
      console.log('Successfully connected to Redis.');
    } catch (err) {
      console.error('Failed to connect to Redis:', err);
      // Don't exit the process, just continue with degraded functionality
    }
  })();
} else {
  console.log('Redis not configured - using mock client');
}

export { redisClient };