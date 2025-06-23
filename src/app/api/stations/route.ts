import { NextRequest, NextResponse } from 'next/server';
import { mavApi } from '@/lib/api/mav';
import { transformMavStation } from '@/lib/api/transformers';

// Cache stations in memory for 1 hour since they don't change often
let stationsCache: { data: any[], timestamp: number } | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    
    // Check cache first
    const now = Date.now();
    if (stationsCache && (now - stationsCache.timestamp < CACHE_DURATION)) {
      console.log('Using cached station data');
    } else {
      console.log('Fetching fresh station data from MÁV...');
      const mavStations = await mavApi.getStations();
      stationsCache = {
        data: mavStations,
        timestamp: now
      };
      console.log(`Cached ${mavStations.length} stations from MÁV API`);
    }
    
    // Transform MÁV stations to our format
    let stations = stationsCache.data
      .filter(station => station.GPS) // Only include stations with GPS coordinates
      .map(transformMavStation);
    
    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      stations = stations.filter(station =>
        station.name.toLowerCase().includes(searchLower)
      );
    }
    
    return NextResponse.json(stations, {
      headers: {
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    });
    
  } catch (error) {
    console.error('Error fetching stations from MÁV:', error);
    
    // Return error response
    return NextResponse.json(
      { error: 'Failed to fetch station data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}