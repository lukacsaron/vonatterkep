import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';
import {
  getTrainDataFreshness,
  REDIS_OP_TIMEOUT_MS,
  STALE_TRAIN_DATA_THRESHOLD_SECONDS,
  TrainDataFreshness,
} from '@/lib/trainFreshness';

export async function GET() {
  try {
    const healthCheck: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      timestamp: string;
      services: { app: string; redis: string };
      data: { trains: TrainDataFreshness };
      uptime: number;
      memory: { used: number; total: number };
    } = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        app: 'running',
        redis: 'unknown'
      },
      data: {
        trains: {
          status: 'unknown',
          trainCount: 0,
          lastUpdate: null,
          ageSeconds: null,
          age: 'unknown',
          staleAfterSeconds: STALE_TRAIN_DATA_THRESHOLD_SECONDS,
        }
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
            setTimeout(() => reject(new Error(`Redis ping timed out after ${REDIS_OP_TIMEOUT_MS}ms`)), REDIS_OP_TIMEOUT_MS)
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

    // How old is the data we are actually serving? Time-boxed the same way, makes
    // no upstream MAV calls, and never throws.
    healthCheck.data.trains = await getTrainDataFreshness();

    if (healthCheck.data.trains.status !== 'fresh') {
      healthCheck.status = 'degraded';
    }

    if (healthCheck.data.trains.status === 'stale') {
      console.error(
        `🚨 Live train data is stale: newest position is ${healthCheck.data.trains.age} old ` +
        `(threshold ${STALE_TRAIN_DATA_THRESHOLD_SECONDS}s, ${healthCheck.data.trains.trainCount} trains cached)`
      );
    } else if (healthCheck.data.trains.status === 'no_data') {
      console.error('🚨 No live train data cached at all - the background worker has never published a cycle');
    }

    // Report degraded in the body, but still answer 200: the app serves pages
    // without Redis and with stale data, and a 503 here makes the orchestrator
    // tear down a working container over a dependency outage or a wedged worker.
    // Only 'unhealthy' - a genuine app failure - may fail the healthcheck.
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
