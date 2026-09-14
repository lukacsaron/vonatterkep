import { NextRequest, NextResponse } from 'next/server';
import { mavApi } from '@/lib/api/mav';
import { transformMavDeparture, transformMavArrival } from '@/lib/api/transformers';

interface RouteParams {
  params: Promise<{
    stationId: string;
  }>;
}

// Cache for timetable data (5-10 minutes as specified)
const timetableCache = new Map<string, { data: any[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { stationId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') as 'departures' | 'arrivals';
    const dateParam = searchParams.get('date');
    
    // Validate required parameters
    if (!stationId) {
      return NextResponse.json(
        { error: 'Missing stationId parameter' },
        { status: 400 }
      );
    }
    
    if (!type || !['departures', 'arrivals'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid or missing type parameter. Must be "departures" or "arrivals"' },
        { status: 400 }
      );
    }
    
    // Parse date parameter
    let queryDate = new Date();
    if (dateParam) {
      try {
        queryDate = new Date(dateParam);
        if (isNaN(queryDate.getTime())) {
          throw new Error('Invalid date format');
        }
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)' },
          { status: 400 }
        );
      }
    }
    
    // Create cache key
    const cacheKey = `${stationId}-${type}-${queryDate.toISOString().split('T')[0]}`;
    
    // Check cache
    const now = Date.now();
    const cached = timetableCache.get(cacheKey);
    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
      console.log(`📋 Using cached timetable data for ${stationId} (${type})`);
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=300', // 5 minutes
        }
      });
    }
    
    console.log(`🚉 Fetching ${type} for station ${stationId} on ${queryDate.toISOString()}`);
    
    // Get station info first to use in transformations
    const stations = await mavApi.getStations();
    const station = stations.find(s => s.UicKod === stationId);
    
    if (!station) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }
    
    // Transform station to our format
    const stationData = {
      id: station.UicKod,
      name: station.Nev,
      coordinates: station.GPS
        ? { latitude: station.GPS.Lat, longitude: station.GPS.Lng }
        : undefined
    };
    
    let timetableData;
    
    if (type === 'departures') {
      const mavDepartures = await mavApi.getDepartures(stationId, queryDate);
      timetableData = mavDepartures.map(departure => 
        transformMavDeparture(departure, stationData)
      );
    } else {
      const mavArrivals = await mavApi.getArrivals(stationId, queryDate);
      timetableData = mavArrivals.map(arrival => 
        transformMavArrival(arrival, stationData)
      );
    }
    
    // Cache the results
    timetableCache.set(cacheKey, {
      data: timetableData,
      timestamp: now
    });
    
    // Clean up old cache entries
    for (const [key, value] of timetableCache.entries()) {
      if (now - value.timestamp > CACHE_DURATION * 2) {
        timetableCache.delete(key);
      }
    }
    
    console.log(`✅ Retrieved ${timetableData.length} ${type} for station ${station.Nev}`);
    
    return NextResponse.json(timetableData, {
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 minutes
      }
    });
    
  } catch (error) {
    console.error('Error fetching station timetable:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch station timetable', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}