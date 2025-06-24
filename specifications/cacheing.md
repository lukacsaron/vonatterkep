## Specification: High-Concurrency Architecture for VasútTérkép

### 1. Vision & Core Principle

**Objective:** To re-architect the VasútTérkép application to handle 5,000+ concurrent users reliably by decoupling the user-facing API from the external MÁV API.

**Core Principle:** *Users request data from our cache; a background worker populates that cache.* This ensures the user experience is fast, scalable, and resilient, regardless of external API performance or user load.

### 2. Architectural Overview

The current architecture (User -> Next.js API -> MÁV API) will be replaced with a three-component system:

1.  **Shared Redis Cache:** A high-speed, in-memory data store that acts as the single source of truth for all real-time data.
2.  **Background Worker:** A dedicated, long-running Node.js process. Its sole responsibility is to periodically fetch data from the MÁV API, transform it, and write it to the Redis cache.
3.  **User-Facing Next.js API:** Now a lightweight, stateless layer. Its sole responsibility is to read data from the Redis cache and serve it to users. It **never** communicates directly with the MÁV API.

#### Data Flow Diagram:

```
                                      +-----------------+
                                      |   MÁV EMMA API  |
                                      +-----------------+
                                                ^
                                                | (Fetches every 25s)
                                                |
+---------------------+           +-------------+-------------+
|                     | (Writes)  |                             |
|  Background Worker  +---------->+        Redis Cache          |
| (worker/index.ts)   |           | (e.g., "cache:trains:live") |
|                     |           |                             |
+---------------------+           +-------------+-------------+
                                                ^
                                                | (Reads data)
                                                |
                                      +-----------------+
                                      |                 |
                                      |  Next.js API    |
                                      | (/api/trains)   |
                                      |                 |
                                      +-----------------+
                                                ^
                                                | (High Concurrency)
                               +----------------+----------------+
                               |                                 |
+------+                       |      Coolify Load Balancer      |
| User |---------------------->+                                 |
+------+                       |                                 |
                               +---------------------------------+
```

### 3. Component Specification

#### 3.1. Redis Cache

*   **Instance:** A standard Redis instance, managed by Coolify.
*   **Data Format:** All data will be stored as JSON strings. The application layer is responsible for `JSON.stringify` on write and `JSON.parse` on read.
*   **Key Naming Convention:** `[type]:[scope]:[identifier]`
*   **Defined Keys:**
    *   `cache:trains:live`
        *   **Content:** A JSON array of all `Train` objects.
        *   **Updated By:** The background worker.
        *   **TTL (Time-To-Live):** 60 seconds. This acts as a safety net. If the worker dies, the key will expire after a minute, preventing the app from serving very old data.
    *   `cache:stations:all`
        *   **Content:** A JSON array of all `Station` objects.
        *   **Updated By:** The `/api/stations` route on cache miss. (This data is less volatile, so the API can manage it directly).
        *   **TTL:** 12 hours.

#### 3.2. Background Worker

*   **Technology:** A standalone Node.js script run with `ts-node` or compiled to JS. It will be a separate process from the Next.js web server.
*   **Fetch Interval:** **25 seconds.** This is chosen to be slightly less than the client-side `refetchInterval` (30 seconds), ensuring data is always fresh.
*   **Logic:** An infinite loop with the following steps:
    1.  Wait for the interval timer.
    2.  Execute `mavApi.getTrainPositions()`.
    3.  On success:
        *   Transform the MÁV data into our `Train[]` format.
        *   Connect to Redis.
        *   `SET` the `cache:trains:live` key with the stringified JSON data, including the 60-second TTL.
        *   Log a success message with the number of trains fetched.
    4.  On failure (MÁV API or network error):
        *   Log the detailed error.
        *   **Do nothing to the cache.** This is critical. The old (stale) data remains in Redis, keeping the site online.
        *   The loop continues, and it will try again on the next interval.

#### 3.3. User-Facing API (`/api/*`)

*   **Principle:** Read-only from cache. Fast, simple, and horizontally scalable.
*   **`/api/trains` Logic:**
    1.  Receive request.
    2.  Connect to Redis.
    3.  `GET` the `cache:trains:live` key.
    4.  If the key exists: `JSON.parse` the value and return it as a 200 OK response.
    5.  If the key is `null` (cache miss, e.g., worker hasn't run yet): Return an empty array `[]` and log a server-side warning. **Do not attempt to fetch from MÁV.**
*   **`/api/stations` Logic:**
    1.  Receive request.
    2.  `GET` the `cache:stations:all` key.
    3.  If key exists (cache hit): Parse and return the data.
    4.  If key is `null` (cache miss):
        *   Fetch the data from `mavApi.getStations()`.
        *   Transform the data.
        *   Asynchronously `SET` the `cache:stations:all` key in Redis with a 12-hour TTL.
        *   Return the freshly fetched data to the user. This is an acceptable "cache-filling" pattern for non-volatile data.

### 4. Implementation Plan (File-by-File)

#### Step 1: Add Dependencies

Modify `package.json` to include the Redis client.

```jsonc
// package.json
"dependencies": {
  // ... existing dependencies
  "redis": "^4.6.15", // Add redis client
  "dotenv": "^16.4.5" // Useful for worker environment variables
},
"devDependencies": {
  // ... existing devDependencies
  "ts-node": "^10.9.2" // To run the TS worker script easily
}
```
Run `npm install`.

#### Step 2: Add New Scripts

Modify the `scripts` section in `package.json` to manage the web and worker processes separately.

```jsonc
// package.json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build && tsc --project tsconfig.worker.json", // Also build the worker
  "start": "npm run start:web",
  "start:web": "next start",
  "start:worker": "node dist/worker/index.js",
  "dev:worker": "ts-node worker/index.ts",
  "lint": "next lint",
  // ... other scripts
},
```

#### Step 3: Create a Shared Redis Client

Create a singleton instance of the Redis client for reuse across the application.

```typescript
// src/lib/redis.ts (New File)
import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is not set.');
}

const redisClient = createClient({
  url: redisUrl,
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect to Redis. This is an async operation.
// We use a self-invoking async function to handle the top-level await.
(async () => {
  try {
    await redisClient.connect();
    console.log('Successfully connected to Redis.');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    // Exit the process if Redis connection fails, as it's critical.
    process.exit(1);
  }
})();

export { redisClient };
```

#### Step 4: Create the Background Worker

Create a new directory `worker/` at the root of the project.

```typescript
// worker/index.ts (New File)
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
```

Add a `tsconfig.worker.json` for building the worker:

```json
// tsconfig.worker.json (New File)
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "module": "commonjs", // Node.js uses CommonJS
    "paths": {
      "@/*": ["./src/*"] // Ensure paths work
    }
  },
  "include": ["worker/**/*.ts", "src/lib/**/*.ts", "src/types/**/*.ts"]
}
```

#### Step 5: Refactor the API Routes

Modify the existing API routes to read from the cache.

```typescript
// src/app/api/trains/route.ts (Modified)
import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';

const CACHE_KEY = 'cache:trains:live';

export async function GET() {
  try {
    const cachedData = await redisClient.get(CACHE_KEY);

    if (cachedData) {
      // Cache Hit: Return the cached data
      const trains = JSON.parse(cachedData);
      return NextResponse.json(trains, {
        headers: {
          'X-Cache-Status': 'HIT'
        }
      });
    } else {
      // Cache Miss: The worker might be down or hasn't run yet.
      // Return an empty array to prevent client errors.
      console.warn('Cache miss for live train data. Returning empty array.');
      return NextResponse.json([], {
        headers: {
          'X-Cache-Status': 'MISS'
        }
      });
    }
  } catch (error) {
    console.error('Error fetching trains from cache:', error);
    return NextResponse.json(
      { error: 'Failed to fetch train data from service cache.' },
      { status: 503 } // 503 Service Unavailable is appropriate here
    );
  }
}
```

(The `stations` route would be refactored similarly, but with the cache-filling logic as described in section 3.3).

### 5. Configuration and Deployment on Coolify

1.  **Environment Variables:** In your Coolify project settings, add the following secrets:
    *   `REDIS_URL`: Provided by Coolify when you create the Redis service.
    *   `WORKER_FETCH_INTERVAL_MS`: `25000`

2.  **Define Services in Coolify:** You will deploy **two** services from the same Git repository.
    *   **Service 1: Web App**
        *   **Build Pack:** `Next.js`
        *   **Start Command:** `npm run start:web` (or let the build pack handle it)
        *   **Deploy:** Expose a public URL for this service.
        *   **Scaling:** Configure to run 4+ instances for high availability.
    *   **Service 2: Worker**
        *   **Build Pack:** `Node.js`
        *   **Install Command:** `npm install`
        *   **Build Command:** `npm run build`
        *   **Start Command:** `npm run start:worker`
        *   **Deploy:** Do **not** expose a URL for this service.
        *   **Scaling:** Run exactly **one** instance of the worker.

3.  **Add Redis Service:**
    *   In Coolify, go to "Services" -> "Add Service" -> "Redis".
    *   Link this Redis instance to your Web and Worker services. Coolify will automatically inject the `REDIS_URL` environment variable.

### 6. Final Resilience Checks

*   **Worker Crash:** Coolify will automatically restart the worker container, which will resume the fetch cycle.
*   **Redis Crash:** The API will return `503 Service Unavailable`. The worker will fail its fetch cycle. Coolify's health checks should restart Redis, and the system will self-heal.
*   **MÁV API Down:** The worker will log errors but continue running. The app will serve stale data for up to 60 seconds (the TTL), after which it will serve an empty list. This is a graceful degradation.