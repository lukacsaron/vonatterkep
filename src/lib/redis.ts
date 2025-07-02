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
  hGet: async () => Promise.resolve(null),
  hSet: async () => Promise.resolve(1),
  hGetAll: async () => Promise.resolve({} as Record<string, string>),
  hKeys: async () => Promise.resolve([]),
  hDel: async () => Promise.resolve(0),
  expire: async () => Promise.resolve(1), // Add missing expire method
  multi: () => ({
    hSet: () => {},
    hDel: () => {},
    exec: async () => Promise.resolve([])
  }),
  publish: async () => Promise.resolve(0),
  duplicate: () => ({
    connect: async () => Promise.resolve(),
    subscribe: async () => Promise.resolve()
  }),
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