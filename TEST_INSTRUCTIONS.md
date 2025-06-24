# Testing WebSocket Implementation

## Prerequisites
✅ Redis is running on port 6379 (already confirmed)
✅ Redis URL added to .env.local

## Testing Steps

### 1. Start the Next.js App with WebSocket Server
Open Terminal 1 and run:
```bash
npm run dev
```

This will start the custom server.js with WebSocket support.

### 2. Start the Worker Process
Open Terminal 2 and run:
```bash
npm run dev:worker
```

This will start fetching train data from MÁV API and publishing to Redis.

### 3. Open the Test Page
Open your browser and navigate to:
```
http://localhost:3000/test-websocket.html
```

### 4. What to Look For

#### In the Browser Console:
- ✅ "Connected! Socket ID: xxx" - WebSocket connection established
- 📂 "Received initial data: X trains" - Initial data received
- 📡 "Received real-time update: X trains" - Real-time updates (every 25 seconds)

#### In Terminal 1 (Server):
- "✅ WebSocket server connected to Redis"
- "Client connected: xxx. Total clients: 1"
- "📢 Received 'new-data' from Redis. Broadcasting train updates..."
- "✅ Broadcasted update for X trains to Y clients"

#### In Terminal 2 (Worker):
- "Starting MÁV data fetch cycle..."
- "Successfully cached X trains and published update"

### 5. Test Real-time Updates
1. Wait for the worker to fetch data (every 25 seconds)
2. Watch the browser console for real-time updates
3. No page refresh needed - updates appear automatically!

### 6. Test Multiple Clients
Open multiple browser tabs with the test page:
- Each should receive the same updates simultaneously
- Server logs will show "Total clients: X"

## Troubleshooting

If WebSocket doesn't connect:
- Check if server.js is running (not regular Next.js dev server)
- Verify Redis is accessible at localhost:6379
- Check browser console for errors

If no train data appears:
- Check worker logs for MÁV API errors
- Verify worker is running and connected to Redis
- Check Redis has data: `docker exec redis-test redis-cli get cache:trains:live`

## Success Criteria
✅ WebSocket connects without polling
✅ Initial data loads immediately
✅ Updates arrive in real-time without refresh
✅ Multiple clients receive synchronized updates
✅ No more 30-second polling requests in Network tab