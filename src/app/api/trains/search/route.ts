import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';
import { Train, TrainSearchResult } from '@/types';

// Redis keys
const HASH_KEY = 'trains:live';

// Helper function to search trains in cached data
function searchTrainsInCache(trains: Train[], query: string): TrainSearchResult[] {
  const normalizedQuery = query.toLowerCase().trim();
  
  return trains
    .filter(train => {
      // Search in train number, name, destination
      const searchText = [
        train.number,
        train.trainName || '',
        train.destination?.name || ''
      ].join(' ').toLowerCase();
      
      return searchText.includes(normalizedQuery);
    })
    .map(train => ({
      gtfsId: train.gtfsId || train.id,
      trainNumber: train.number,
      trainName: train.trainName || undefined,
      trainType: train.type,
      origin: {
        name: 'Unknown', // Origin not available in current Train interface
        time: new Date() // Using current time as fallback
      },
      destination: {
        name: train.destination?.name || 'Unknown', 
        time: new Date() // Using current time as fallback
      },
      durationMinutes: 120, // Default duration, could be calculated from route
      liveDelayMinutes: train.delay,
      isActive: true // All cached trains are active by definition
    }))
    .slice(0, 20); // Limit results
}

// Helper function to get featured trains from cache
function getFeaturedTrainsFromCache(trains: Train[]): TrainSearchResult[] {
  const featuredKeywords = ['IC', 'InterCity', 'Railjet', 'TÓPART', 'BALATON', 'EC', 'Express'];
  
  return trains
    .filter(train => {
      const trainText = (train.number + ' ' + (train.trainName || '')).toUpperCase();
      return featuredKeywords.some(keyword => trainText.includes(keyword));
    })
    .map(train => ({
      gtfsId: train.gtfsId || train.id,
      trainNumber: train.number,
      trainName: train.trainName || undefined,
      trainType: train.type,
      origin: {
        name: 'Unknown', // Origin not available in current Train interface
        time: new Date()
      },
      destination: {
        name: train.destination?.name || 'Unknown',
        time: new Date()
      },
      durationMinutes: 120, // Default duration, could be calculated from route
      liveDelayMinutes: train.delay,
      isActive: true
    }))
    .slice(0, 10); // Max 10 featured trains
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const featured = searchParams.get('featured') === 'true';
    
    console.log(`🔍 Searching trains with params:`, { q, featured });
    
    // Get all current trains from Redis cache
    const trainHash = await redisClient.hGetAll(HASH_KEY) as Record<string, string>;
    
    if (Object.keys(trainHash).length === 0) {
      console.warn('⚠️ No trains found in cache, returning empty results');
      return NextResponse.json([]);
    }
    
    // Parse all cached trains
    const trains: Train[] = Object.values(trainHash).map(trainStr => JSON.parse(trainStr));
    
    console.log(`📊 Found ${trains.length} trains in cache`);
    
    let results: TrainSearchResult[];
    
    // Handle featured trains request
    if (featured) {
      console.log('🌟 Getting featured trains from cache...');
      results = getFeaturedTrainsFromCache(trains);
      console.log(`✅ Found ${results.length} featured trains`);
    } else {
      // Handle search query
      if (!q) {
        return NextResponse.json(
          { error: 'Search query "q" parameter is required' },
          { status: 400 }
        );
      }
      
      results = searchTrainsInCache(trains, q);
      console.log(`✅ Found ${results.length} trains matching "${q}"`);
    }
    
    // Sort results by delay (on-time first) and then by train number
    results.sort((a, b) => {
      // Prioritize on-time trains
      if ((a.liveDelayMinutes || 0) !== (b.liveDelayMinutes || 0)) {
        return (a.liveDelayMinutes || 0) - (b.liveDelayMinutes || 0);
      }
      // Then sort by train number
      return a.trainNumber.localeCompare(b.trainNumber);
    });
    
    console.log(`📊 Search results summary:`);
    console.log(`  - Total results: ${results.length}`);
    console.log(`  - On-time trains: ${results.filter(t => (t.liveDelayMinutes || 0) < 5).length}`);
    console.log(`  - Delayed trains: ${results.filter(t => (t.liveDelayMinutes || 0) >= 5).length}`);
    
    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'public, max-age=60', // 1 minute cache (data is real-time)
        'X-Cache-Source': 'REDIS_HASH',
        'X-Train-Count': trains.length.toString()
      }
    });
    
  } catch (error) {
    console.error('Error searching trains:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to search trains', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}