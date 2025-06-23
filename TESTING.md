# Testing the Redis Caching System Locally

## Option 1: Quick Test (Without Redis)

The easiest way to test locally is without Redis - the app will use a mock client:

```bash
# 1. Start the Next.js development server
npm run dev

# 2. Open browser to http://localhost:3000
# - The app will work normally but without caching
# - API calls will go directly to MÁV (old behavior)
# - You'll see "Redis not configured - using mock client" in console
```

## Option 2: Full Redis Testing (Recommended)

### Step 1: Install and Start Redis

**Option A: Using Docker (Recommended)**
```bash
# Start Redis in Docker
docker run -d --name redis-test -p 6379:6379 redis:7-alpine

# Verify it's running
docker ps
```

**Option B: Using Homebrew (macOS)**
```bash
# Install Redis
brew install redis

# Start Redis
brew services start redis

# Or start manually
redis-server
```

**Option C: Using APT (Ubuntu/Debian)**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### Step 2: Configure Environment

```bash
# Copy the example environment file
cp .env.local.example .env.local

# Edit .env.local and set:
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
```

### Step 3: Test the Complete System

**Terminal 1: Start the Background Worker**
```bash
npm run dev:worker
```

You should see:
```
Background worker started. Fetching data every 25 seconds.
Starting MÁV data fetch cycle...
Successfully connected to Redis.
Successfully fetched and cached X trains.
```

**Terminal 2: Start the Web Server**
```bash
npm run dev
```

**Terminal 3: Test the APIs**
```bash
# Test trains API (should return cached data)
curl -v http://localhost:3000/api/trains

# Look for the header:
# X-Cache-Status: HIT (if worker has run)
# X-Cache-Status: MISS (if worker hasn't populated cache yet)

# Test stations API
curl -v http://localhost:3000/api/stations?search=Tapolca
```

### Step 4: Verify Caching is Working

**Check Redis directly:**
```bash
# Connect to Redis CLI
redis-cli

# Check what keys exist
127.0.0.1:6379> KEYS *

# Should show:
# 1) "cache:trains:live"
# 2) "cache:stations:all"

# Check train data
127.0.0.1:6379> GET cache:trains:live

# Check TTL (time to live)
127.0.0.1:6379> TTL cache:trains:live

# Exit Redis CLI
127.0.0.1:6379> EXIT
```

## Option 3: Test Without MÁV APIs (Simulate Failures)

To test how the system handles MÁV API failures:

1. **Block MÁV API access** (simulate network issues):
   ```bash
   # Add to /etc/hosts (requires sudo)
   echo "127.0.0.1 jegy.mav.hu" | sudo tee -a /etc/hosts
   echo "127.0.0.1 vim.mav-start.hu" | sudo tee -a /etc/hosts
   ```

2. **Start the worker** - it should fail gracefully:
   ```bash
   npm run dev:worker
   ```

3. **Check API responses** - should return fallback data or empty arrays:
   ```bash
   curl http://localhost:3000/api/trains     # Returns []
   curl http://localhost:3000/api/stations   # Returns fallback stations
   ```

4. **Restore access**:
   ```bash
   sudo sed -i '' '/mav/d' /etc/hosts
   ```

## Debugging and Monitoring

### Check Application Logs
- **Worker logs**: Shows fetch cycles, errors, Redis operations
- **API logs**: Shows cache hits/misses, fallback usage
- **Browser console**: Shows client-side behavior

### Redis Monitoring
```bash
# Monitor Redis commands in real-time
redis-cli MONITOR

# Check Redis info
redis-cli INFO

# Check memory usage
redis-cli INFO MEMORY
```

### Performance Testing
```bash
# Test API performance with ab (Apache Bench)
ab -n 100 -c 10 http://localhost:3000/api/trains

# Test with curl timing
curl -w "@curl-format.txt" -s http://localhost:3000/api/trains

# Create curl-format.txt:
echo "     time_namelookup:  %{time_namelookup}\n        time_connect:  %{time_connect}\n     time_appconnect:  %{time_appconnect}\n    time_pretransfer:  %{time_pretransfer}\n       time_redirect:  %{time_redirect}\n  time_starttransfer:  %{time_starttransfer}\n                     ----------\n          time_total:  %{time_total}\n" > curl-format.txt
```

## Expected Behavior

### Cache HIT (Normal Operation)
- Worker fetches data every 25 seconds
- APIs respond in <5ms with cached data
- `X-Cache-Status: HIT` header present
- Train data refreshes automatically on map

### Cache MISS (Initial startup or worker down)
- APIs return empty arrays or fallback data
- `X-Cache-Status: MISS` header present
- No errors in browser, graceful degradation

### MÁV API Failure
- Worker logs errors but continues running
- Old cached data served until TTL expires
- After TTL: APIs return empty arrays
- System remains responsive

## Cleanup

```bash
# Stop Docker Redis
docker stop redis-test
docker rm redis-test

# Stop Homebrew Redis
brew services stop redis

# Remove test environment
rm .env.local
```

## Common Issues

1. **Redis connection refused**: Make sure Redis is running on port 6379
2. **Worker crashes**: Check MÁV API availability and network connectivity  
3. **Cache always MISS**: Verify worker is running and successfully fetching data
4. **Build fails**: Make sure all dependencies are installed (`npm install`)

## Success Indicators

✅ Worker logs "Successfully fetched and cached X trains" every 25s  
✅ API returns data with "X-Cache-Status: HIT"  
✅ Redis contains `cache:trains:live` and `cache:stations:all` keys  
✅ Map shows trains updating in real-time  
✅ Station search finds Tapolca, Veszprém, Ukk  
✅ System works even when MÁV APIs are down