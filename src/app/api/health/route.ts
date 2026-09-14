import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';

export async function GET() {
  try {
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        app: 'running',
        redis: 'unknown'
      },
      uptime: process.uptime(),
      memory: {
        used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
        total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100
      }
    };

    // Check Redis connection.
    // The redis client retries internally, so an unreachable server makes ping()
    // hang instead of rejecting - that turns this endpoint into a black hole and
    // the container healthcheck times out. Time-box it.
    try {
      if (redisClient && typeof redisClient.ping === 'function') {
        await Promise.race([
          redisClient.ping(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis ping timed out after 2000ms')), 2000)
          ),
        ]);
        healthCheck.services.redis = 'connected';
      } else {
        healthCheck.services.redis = 'not_configured';
      }
    } catch (redisError) {
      console.warn('Redis health check failed:', redisError);
      healthCheck.services.redis = 'disconnected';
      healthCheck.status = 'degraded';
    }

    // Report degraded in the body, but still answer 200: the app serves pages
    // without Redis, and a 503 here makes the orchestrator tear down a working
    // container over a dependency outage.
    const statusCode = healthCheck.status === 'unhealthy' ? 503 : 200;
    
    return NextResponse.json(healthCheck, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      services: {
        app: 'error',
        redis: 'unknown'
      }
    }, { status: 500 });
  }
}