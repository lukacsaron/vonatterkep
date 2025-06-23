#!/bin/sh

# VonatterKep Startup Script
echo "🚀 Starting VonatterKep application..."

# Check if required files exist
if [ ! -f "server.js" ]; then
    echo "❌ server.js not found!"
    exit 1
fi

if [ ! -f "dist/worker/index.js" ]; then
    echo "⚠️  Worker not found, starting web server only..."
    exec node server.js
fi

# Function to handle shutdown gracefully
cleanup() {
    echo "🛑 Shutting down application..."
    if [ ! -z "$WORKER_PID" ]; then
        kill $WORKER_PID 2>/dev/null
    fi
    if [ ! -z "$WEB_PID" ]; then
        kill $WEB_PID 2>/dev/null
    fi
    exit 0
}

# Set up signal traps
trap cleanup SIGTERM SIGINT

echo "🔧 Starting background worker..."
node dist/worker/index.js &
WORKER_PID=$!
echo "✅ Worker started (PID: $WORKER_PID)"

echo "🌐 Starting web server..."
node server.js &
WEB_PID=$!
echo "✅ Web server started (PID: $WEB_PID)"

echo "🎉 VonatterKep is running!"
echo "   Web: http://localhost:${PORT:-3000}"
echo "   Health: http://localhost:${PORT:-3000}/api/health"

# Wait for any process to exit
wait -n
exit_code=$?

echo "💥 Process exited with code: $exit_code"
cleanup