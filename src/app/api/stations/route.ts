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
      try {
        const mavStations = await mavApi.getStations();
        stationsCache = {
          data: mavStations,
          timestamp: now
        };
        console.log(`Cached ${mavStations.length} stations from MÁV API`);
      } catch (stationError) {
        console.warn('MÁV station API failed, using fallback station data:', stationError);
        // Use a basic fallback set of major Hungarian stations
        const fallbackStations = [
          { UicKod: '550300', Nev: 'Budapest-Keleti', GPS: { Lat: 47.5000, Lng: 19.0833 } },
          { UicKod: '550301', Nev: 'Budapest-Nyugati', GPS: { Lat: 47.5167, Lng: 19.0667 } },
          { UicKod: '550302', Nev: 'Budapest-Déli', GPS: { Lat: 47.4667, Lng: 19.0167 } },
          { UicKod: '550800', Nev: 'Debrecen', GPS: { Lat: 47.5316, Lng: 21.6273 } },
          { UicKod: '551200', Nev: 'Szeged', GPS: { Lat: 46.2530, Lng: 20.1414 } },
          { UicKod: '551600', Nev: 'Pécs', GPS: { Lat: 46.0727, Lng: 18.2323 } },
          { UicKod: '551100', Nev: 'Győr', GPS: { Lat: 47.6833, Lng: 17.6333 } },
          { UicKod: '551400', Nev: 'Miskolc', GPS: { Lat: 48.1031, Lng: 20.7784 } },
          { UicKod: '551500', Nev: 'Szombathely', GPS: { Lat: 47.2333, Lng: 16.6167 } },
          { UicKod: '551700', Nev: 'Keszthely', GPS: { Lat: 46.7667, Lng: 17.2500 } }
        ];
        stationsCache = {
          data: fallbackStations,
          timestamp: now
        };
        console.log(`Using fallback data with ${fallbackStations.length} major stations`);
      }
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