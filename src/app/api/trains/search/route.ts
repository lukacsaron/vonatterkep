import { NextRequest, NextResponse } from 'next/server';
import { mavApi } from '@/lib/api/mav';
import { transformSearchResult } from '@/lib/api/transformers';
import { TrainSearchResult } from '@/types';

// Cache for search results (5-10 minutes as specified in requirements)
const searchCache = new Map<string, { data: TrainSearchResult[], timestamp: number }>();
const CACHE_DURATION = 7 * 60 * 1000; // 7 minutes

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const fromStationId = searchParams.get('fromStationId');
    const toStationId = searchParams.get('toStationId');
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const featured = searchParams.get('featured') === 'true';
    
    // Handle featured trains request
    if (featured) {
      console.log('🌟 Fetching featured trains...');
      try {
        // Get some major InterCity and fast trains as featured content
        const featuredQueries = ['IC', 'InterCity', 'Railjet', 'TÓPART', 'BALATON'];
        const allFeaturedResults: TrainSearchResult[] = [];
        
        for (const query of featuredQueries) {
          try {
            const results = await mavApi.searchTrains({ q: query, date });
            const transformedResults = results.map(result => transformSearchResult(result, new Map()));
            allFeaturedResults.push(...transformedResults.slice(0, 3)); // Max 3 per category
          } catch (error) {
            console.warn(`Failed to fetch featured trains for "${query}":`, error);
          }
        }
        
        // Remove duplicates and sort by departure time
        const uniqueResults = allFeaturedResults.filter((result, index, arr) => 
          arr.findIndex(r => r.trainNumber === result.trainNumber) === index
        );
        
        uniqueResults.sort((a, b) => a.origin.time.getTime() - b.origin.time.getTime());
        
        console.log(`✅ Found ${uniqueResults.length} featured trains`);
        return NextResponse.json(uniqueResults.slice(0, 10)); // Max 10 featured trains
      } catch (error) {
        console.warn('Failed to fetch featured trains, returning empty array:', error);
        return NextResponse.json([]);
      }
    }
    
    // Validate that at least one search parameter is provided
    if (!q && !fromStationId) {
      return NextResponse.json(
        { error: 'At least one of "q" or "fromStationId" parameters is required' },
        { status: 400 }
      );
    }
    
    // Validate date format
    let searchDate: Date;
    try {
      searchDate = new Date(date);
      if (isNaN(searchDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD format' },
        { status: 400 }
      );
    }
    
    // Create cache key based on search parameters
    const cacheKey = `${q || ''}-${fromStationId || ''}-${toStationId || ''}-${date}`;
    
    // Check cache
    const now = Date.now();
    const cached = searchCache.get(cacheKey);
    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
      console.log(`🔍 Using cached search results for: ${cacheKey}`);
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=420', // 7 minutes
        }
      });
    }
    
    console.log(`🔍 Searching trains with params:`, { q, fromStationId, toStationId, date });
    
    // Try to get stations for name mapping, but continue without them if it fails
    let stationMap = new Map<string, { id: string; name: string; coordinates: { latitude: number; longitude: number } }>();
    try {
      const stations = await mavApi.getStations();
      stationMap = new Map(
        stations.map(station => [station.UicKod, {
          id: station.UicKod,
          name: station.Nev,
          coordinates: {
            latitude: station.GPS?.Lat || 0,
            longitude: station.GPS?.Lng || 0
          }
        }])
      );
      console.log(`📍 Loaded ${stations.length} stations for mapping`);
    } catch (stationError) {
      console.warn('⚠️ Station API unavailable, continuing with basic search:', stationError);
      // Continue without station mapping - search will use fallback methods
    }
    
    // Perform the search using the enhanced MÁV API client
    const searchResults = await mavApi.searchTrains({
      q: q || undefined,
      fromStationId: fromStationId || undefined,
      toStationId: toStationId || undefined,
      date
    });
    
    // Transform search results to our TrainSearchResult format
    const transformedResults: TrainSearchResult[] = searchResults.map(result => 
      transformSearchResult(result, stationMap)
    );
    
    // Sort results by departure time and relevance
    transformedResults.sort((a, b) => {
      // Prioritize active trains (with live delay info)
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      
      // Then sort by departure time
      return a.origin.time.getTime() - b.origin.time.getTime();
    });
    
    // Cache the results
    searchCache.set(cacheKey, {
      data: transformedResults,
      timestamp: now
    });
    
    // Clean up old cache entries
    for (const [key, value] of searchCache.entries()) {
      if (now - value.timestamp > CACHE_DURATION * 2) {
        searchCache.delete(key);
      }
    }
    
    console.log(`✅ Found ${transformedResults.length} trains matching search criteria`);
    
    // Log some statistics for debugging
    const activeTrains = transformedResults.filter(t => t.isActive);
    const delayedTrains = transformedResults.filter(t => t.liveDelayMinutes && t.liveDelayMinutes > 5);
    
    console.log(`📊 Search results summary:`);
    console.log(`  - Total results: ${transformedResults.length}`);
    console.log(`  - Active trains: ${activeTrains.length}`);
    console.log(`  - Delayed trains: ${delayedTrains.length}`);
    
    return NextResponse.json(transformedResults, {
      headers: {
        'Cache-Control': 'public, max-age=420', // 7 minutes
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