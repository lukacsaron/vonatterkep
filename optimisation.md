You're absolutely right, and thank you for that sharp observation. My previous suggestion for bounding-box filtering is a standard optimization, but you've correctly identified that for a national-level map where all trains are usually visible, its benefit is limited. The real bottleneck at scale isn't the *amount* of data, but the *method* of its delivery.

Your suggestion to use WebSockets is the correct and superior architectural choice here. Switching from a client-pull (polling) to a server-push (streaming) model will dramatically reduce server load, eliminate redundant requests, and provide true real-time updates.

Here is a detailed technical specification for re-architecting the data delivery system using WebSockets and Redis Pub/Sub.

---

### **Optimized Architecture: Real-Time Streaming with WebSockets**

The core `Worker -> Redis Cache` pattern remains. We will build a highly efficient, scalable push layer on top of it.

#### **Data Flow Diagram (New)**

```
+----------------+      (1) Fetch       +----------------+
|      MÁV       | <------------------+  Worker Process  |
|      API       |                      +----------------+
+----------------+                              |
                                                | (2a) Update Train Hash
                                                v
+----------------+      (2b) Publish      +----------------+
|  WebSocket     |      "updated" msg     |                |
|  Server(s)     +<----------------------(4)+  Redis Pub/Sub |
| (on Next.js)   | (3) Subscribe to msg   |                |
+----------------+------------------------+----^-----------+
       ^   |                                   |
       |   | (5) Fetch latest data from Hash   |
       |   v                                   |
+------|---+----------------+           +----------------+
|  Connected Clients (Users) | <----------(6) Push |   Redis Cache  |
| (via WebSocket)          |        Update      | (HASH: trains:live) |
+--------------------------+                      +----------------+
```

1.  **Worker** fetches data from the MÁV API.
2.  Worker **updates the `trains:live` HASH** in Redis and **publishes a simple "updated" message** to a Redis channel (e.g., `trains:updates`).
3.  All instances of our **WebSocket server** are subscribed to this Redis channel.
4.  They receive the "updated" message.
5.  Upon receiving the message, they fetch the **full, fresh train dataset** from the `trains:live` HASH.
6.  They **broadcast** this complete dataset to all connected clients over the WebSocket connection.

This is highly scalable. One worker update triggers a broadcast to thousands of users across multiple server instances simultaneously.

---

### **Technical Specification & Implementation Plan**

#### **Step 1: Add Dependencies**

Modify `package.json` and run `npm install`:

```json
// package.json
"dependencies": {
  // ... existing dependencies
  "socket.io": "^4.7.5",
  "socket.io-client": "^4.7.5"
},
```

We will leverage the existing `redis` client for Pub/Sub.

#### **Step 2: Create a Custom Server with WebSocket Integration**

Next.js's standalone output can be run with a custom server file. We will create this to manage WebSocket connections.

**File:** `server.js` (at the project root)

```javascript
// server.js
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { createClient } = require('redis');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Redis Pub/Sub Channel
const REDIS_CHANNEL = 'trains:updates';

app.prepare().then(async () => {
  // --- Redis Connection for this Server Instance ---
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('REDIS_URL is not defined. WebSocket server will not work.');
    // Start Next.js without WS for local dev without Redis
    createServer((req, res) => handle(req, res)).listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
    return;
  }

  const redisClient = createClient({ url: redisUrl });
  const subscriber = redisClient.duplicate();

  await Promise.all([redisClient.connect(), subscriber.connect()]);
  console.log('✅ WebSocket server connected to Redis.');

  // --- HTTP and WebSocket Server Setup ---
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: '/api/socket', // Serve socket.io on this path
    cors: { origin: '*' }, // Configure for your domain in production
  });

  // --- WebSocket Connection Logic ---
  io.on('connection', (socket) => {
    console.log(`- Client connected: ${socket.id}. Total clients: ${io.engine.clientsCount}`);

    // Send initial data on connection
    redisClient.hGetAll('trains:live').then(trainHash => {
      if (Object.keys(trainHash).length > 0) {
        const trains = Object.values(trainHash).map(t => JSON.parse(t));
        socket.emit('initial-data', trains);
      }
    });

    socket.on('disconnect', () => {
      console.log(`- Client disconnected: ${socket.id}. Total clients: ${io.engine.clientsCount}`);
    });
  });

  // --- Redis Subscriber Logic ---
  await subscriber.subscribe(REDIS_CHANNEL, async (message) => {
    console.log(`📢 Received '${message}' from Redis. Broadcasting train updates...`);
    try {
      const trainHash = await redisClient.hGetAll('trains:live');
      if (Object.keys(trainHash).length > 0) {
        const trains = Object.values(trainHash).map(t => JSON.parse(t));
        io.emit('trains-update', trains); // Broadcast to all clients
        console.log(`✅ Broadcasted update for ${trains.length} trains to ${io.engine.clientsCount} clients.`);
      }
    } catch (e) {
      console.error('Error fetching from Redis or broadcasting:', e);
    }
  });
  
  // --- Start the Server ---
  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
```
**Important:** Your `Dockerfile` and `start.sh` already seem to be configured to use a `server.js` file, which is perfect. You may need to adjust them slightly if they are not already.

#### **Step 3: Modify the Worker to Publish Updates**

**File:** `worker/index.ts`

```typescript
// ... (imports and existing logic)

async function runFetchCycle() {
  console.log('Starting MÁV data fetch cycle...');
  try {
    const mavTrains = await mavApi.getTrainPositions();
    const trains: Train[] = mavTrains
      .filter(train => train.UtolsoGPS)
      .map(transformMavTrain);
      
    if (trains.length === 0) {
      // ... (existing logic)
      return;
    }

    // --- (Use HASH logic from previous recommendation) ---
    // ... pipeline.hSet, redisClient.hDel, etc. ...
    
    // **NEW: Publish update notification**
    await redisClient.publish('trains:updates', 'new-data');
    
    console.log(`Successfully cached ${trains.length} trains and published update.`);

  } catch (error) {
    // ... (existing error handling)
  }
}
// ... (rest of the worker file)
```

#### **Step 4: Refactor the Frontend to Use WebSockets**

This is the final piece, where we switch the client from polling to listening.

**File:** `src/lib/hooks/useTrains.ts`

```typescript
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { Train } from '@/types';
import { api } from '@/lib/api/client';

export function useTrains() {
  const queryClient = useQueryClient();

  // The useQuery hook is now for INITIAL data load only.
  // It will not refetch. Updates come via WebSocket.
  const queryInfo = useQuery({
    queryKey: ['trains'],
    queryFn: () => api.get<Train[]>('/api/trains'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  useEffect(() => {
    // Connect to the WebSocket server
    const socket: Socket = io({ path: '/api/socket' });

    socket.on('connect', () => {
      console.log('🔌 WebSocket connected:', socket.id);
    });

    // Listener for real-time updates
    socket.on('trains-update', (trains: Train[]) => {
      console.log(`📡 Received ${trains.length} train updates via WebSocket.`);
      // Manually update the TanStack Query cache with the new data.
      // This will automatically re-render all components using this hook.
      queryClient.setQueryData(['trains'], trains);
    });
    
    // Listener for initial data if the first API call was empty
    socket.on('initial-data', (trains: Train[]) => {
        console.log(`📂 Received ${trains.length} initial trains via WebSocket.`);
        queryClient.setQueryData(['trains'], trains);
    });

    socket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected.');
    });

    // Cleanup on component unmount
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  // Return the same data structure as before for component compatibility
  return queryInfo;
}

// The /api/trains route is still useful for the initial load and for clients that don't support WebSockets.
```

### **Advantages of this Architecture**

*   **Massive Reduction in Requests:** Instead of 5,000 clients polling every 30 seconds (~167 RPS), you have 5,000 persistent connections and a data broadcast only when there's an actual update. This is a >95% reduction in HTTP request overhead.
*   **True Real-Time:** Clients get updates the moment the worker processes them, not on their next polling interval. Latency drops from `~0-30s` to `<1s`.
*   **Improved Server Performance:** The Next.js API servers spend far less CPU time handling API requests and querying Redis. They are mostly idle, waiting for a Pub/Sub message.
*   **Scalability:** This model scales beautifully. Add more Next.js/WebSocket server instances, and Coolify's load balancer will distribute the connections. The Redis Pub/Sub system ensures all instances get notified and can broadcast to their clients.
*   **Resilience:** The system is decoupled. If a WebSocket server instance goes down, clients will reconnect to another one. The worker and Redis are independent.