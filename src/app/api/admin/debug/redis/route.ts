import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';
import { isAuthorizedAdmin } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔍 Debug Redis keys...');
    
    // Get all keys
    const allKeys = await redisClient.keys('*');
    
    // Get specific train keys
    const trainKeys = await redisClient.keys('*train*');
    const cacheKeys = await redisClient.keys('cache:*');
    
    // Get hash content if exists
    let hashContent = null;
    try {
      const hashKeys = await redisClient.hKeys('trains:live');
      const hashLength = await redisClient.hLen('trains:live');
      hashContent = { keys: hashKeys.slice(0, 5), totalCount: hashLength };
    } catch (e) {
      hashContent = { error: 'Hash not found or empty' };
    }
    
    return NextResponse.json({
      totalKeys: allKeys.length,
      trainKeys: trainKeys.length,
      cacheKeys: cacheKeys.length,
      allKeys: allKeys.slice(0, 10), // First 10 keys
      trainKeysDetails: trainKeys.slice(0, 5),
      cacheKeysDetails: cacheKeys.slice(0, 5),
      hashContent,
      redisInfo: {
        connected: true,
        dbSize: allKeys.length
      }
    });
    
  } catch (error) {
    console.error('Error debugging Redis:', error);
    return NextResponse.json(
      { error: 'Failed to debug Redis', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}