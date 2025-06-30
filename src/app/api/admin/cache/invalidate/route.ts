import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
    // Check for admin auth (simple approach)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== 'Bearer admin-clear-cache') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🧹 Clearing train cache...');
    
    // Clear all train-related cache keys
    const keys = await redisClient.keys('cache:trains:*');
    const hashKeys = await redisClient.keys('trains:*');
    
    const allKeys = [...keys, ...hashKeys];
    
    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
      console.log(`✅ Cleared ${allKeys.length} cache keys`);
    }
    
    return NextResponse.json({
      success: true,
      clearedKeys: allKeys.length,
      message: 'Cache invalidated successfully'
    });
    
  } catch (error) {
    console.error('Error invalidating cache:', error);
    return NextResponse.json(
      { error: 'Failed to invalidate cache' },
      { status: 500 }
    );
  }
}