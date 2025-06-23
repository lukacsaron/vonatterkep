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