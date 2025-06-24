import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';

const CACHE_KEY = 'cache:trains:live';
const HASH_KEY = 'trains:live';

export async function GET() {
  try {
    // First, try to get data from the optimized HASH storage
    const trainHash = await redisClient.hGetAll(HASH_KEY) as Record<string, string>;
    
    if (Object.keys(trainHash).length > 0) {
      // HASH Hit: Parse and return the train data
      const trains = Object.values(trainHash).map(trainStr => JSON.parse(trainStr));
      return NextResponse.json(trains, {
        headers: {
          'X-Cache-Status': 'HIT',
          'X-Cache-Type': 'HASH'
        }
      });
    }
    
    // Fallback to legacy cache key for backward compatibility
    const cachedData = await redisClient.get(CACHE_KEY);

    if (cachedData) {
      // Cache Hit: Return the cached data
      const trains = JSON.parse(cachedData);
      return NextResponse.json(trains, {
        headers: {
          'X-Cache-Status': 'HIT',
          'X-Cache-Type': 'STRING'
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