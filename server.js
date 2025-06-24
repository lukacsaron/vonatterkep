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
        const trains = Object.entries(trainHash).map(([, t]) => JSON.parse(t));
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
        const trains = Object.entries(trainHash).map(([, t]) => JSON.parse(t));
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