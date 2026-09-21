import { NextRequest, NextResponse } from 'next/server';
import { mavApi } from '@/lib/api/mav';
import { redisClient } from '@/lib/redis';
import { RouteDetails } from '@/types';
import { attachStationData, loadGtfsIndex } from '@/lib/gtfs/stations';
import { withTimeout } from '@/lib/trainSnapshot';

const ROUTE_CACHE_TTL_SECONDS = 300; // 5 minutes

interface RouteParams {
  params: Promise<{
    gtfsId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { gtfsId } = await params;
    
    if (!gtfsId) {
      return NextResponse.json(
        { error: 'Missing gtfsId parameter' },
        { status: 400 }
      );
    }

    console.log(`🗺️ Fetching route details for gtfsId: ${gtfsId}`);
    
    // Check cache first
    const cacheKey = `cache:route:${gtfsId}`;
    try {
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        console.log(`✅ Found route details in cache for ${gtfsId}`);
        const routeDetails: RouteDetails = JSON.parse(cachedData);
        
        return NextResponse.json(routeDetails, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Cache-Status': 'HIT',
            'X-Cache-Type': 'ROUTE',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }
    } catch (redisError) {
      console.warn(`Failed to check Redis cache for route ${gtfsId}:`, redisError);
    }
    
    // Cache miss. vonatinfo.mav.hu carries the timetable AND the route polyline
    // for a train; ids stored as gtfsId are ElviraIDs, which is exactly what it
    // expects. It is the only source: the OTP backend (mavplusz.hu) that used to
    // be the fallback here IP-blocks this server.
    let train;
    try {
      train = await mavApi.getTrainFromVonatinfo(gtfsId);
    } catch (vonatinfoError) {
      console.error(`vonatinfo route lookup failed for ${gtfsId}:`, vonatinfoError);
      return NextResponse.json(
        {
          error: 'Failed to fetch route data',
          details: vonatinfoError instanceof Error ? vonatinfoError.message : 'Unknown error'
        },
        { status: 502 }
      );
    }

    if (!train || train.stops.length === 0) {
      console.warn(`No route data from vonatinfo for ${gtfsId}`);
      return NextResponse.json(
        {
          error: 'Route data not available',
          details: 'Could not fetch complete route information for this train'
        },
        { status: 404 }
      );
    }

    // Coordinates per stop let the map resolve which way the polyline runs.
    const gtfsIndex = await withTimeout(loadGtfsIndex(redisClient), 'gtfs station index', 2000).catch(() => null);
    const routeDetails: RouteDetails = {
      gtfsId,
      geometry: train.geometry,
      stops: gtfsIndex ? attachStationData(train.stops, gtfsIndex.byName).stops : train.stops,
    };
    try {
      await redisClient.set(cacheKey, JSON.stringify(routeDetails), { EX: ROUTE_CACHE_TTL_SECONDS });
    } catch (cacheError) {
      console.warn(`Could not cache route for ${gtfsId}:`, cacheError);
    }
    console.log(`✅ vonatinfo route: ${routeDetails.stops.length} stops for ${gtfsId}`);
    return NextResponse.json(routeDetails, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Cache-Status': 'MISS',
        'X-Cache-Type': 'ROUTE',
        'X-Data-Source': 'vonatinfo',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    });

  } catch (error) {
    console.error(`Error in route-details endpoint:`, error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}