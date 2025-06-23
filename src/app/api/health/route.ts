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

    // Check Redis connection
    try {
      if (redisClient && typeof redisClient.ping === 'function') {
        await redisClient.ping();
        healthCheck.services.redis = 'connected';
      } else {
        healthCheck.services.redis = 'not_configured';
      }
    } catch (redisError) {
      console.warn('Redis health check failed:', redisError);
      healthCheck.services.redis = 'disconnected';
      healthCheck.status = 'degraded';
    }

    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
    
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