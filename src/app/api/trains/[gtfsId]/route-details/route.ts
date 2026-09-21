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
    
    // Cache miss - fetch data from MÁV APIs in parallel
    console.log(`🔄 Cache miss - fetching route data from MÁV APIs for ${gtfsId}`);
    
    try {
      // vonatinfo.mav.hu carries the timetable AND the route polyline for a
      // train and, unlike the OTP backend, is reachable from this server. Ids
      // stored as gtfsId are ElviraIDs, which is exactly what it expects.
      try {
        const viaVonatinfo = await mavApi.getRouteDetailsFromVonatinfo(gtfsId);
        if (viaVonatinfo && viaVonatinfo.stops.length > 0) {
          // Coordinates per stop let the map resolve which way the polyline runs.
          const gtfsIndex = await withTimeout(loadGtfsIndex(redisClient), 'gtfs station index', 2000).catch(() => null);
          const routeDetails: RouteDetails = {
            gtfsId,
            geometry: viaVonatinfo.geometry,
            stops: gtfsIndex ? attachStationData(viaVonatinfo.stops, gtfsIndex.byName).stops : viaVonatinfo.stops,
          };
          try {
            await redisClient.set(cacheKey, JSON.stringify(routeDetails), { EX: ROUTE_CACHE_TTL_SECONDS });
          } catch (cacheError) {
            console.warn(`Could not cache route for ${gtfsId}:`, cacheError);
          }
          return NextResponse.json(routeDetails, {
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'X-Cache-Status': 'MISS',
              'X-Data-Source': 'vonatinfo',
            },
          });
        }
      } catch (vonatinfoError) {
        console.warn(`vonatinfo route lookup failed for ${gtfsId}:`, vonatinfoError);
      }

      // Parallel fetch of both geometry and trip details
      const [geometry, trainDetails] = await Promise.all([
        mavApi.getTrainGeometry(gtfsId),
        mavApi.getTrainDetails(gtfsId)
      ]);
      
      if (!geometry || !trainDetails) {
        console.warn(`⚠️ Failed to get complete route data for ${gtfsId}:`, {
          hasGeometry: !!geometry,
          hasDetails: !!trainDetails,
          stopsCount: trainDetails?.stops?.length
        });
        
        return NextResponse.json(
          { 
            error: 'Route data not available',
            details: 'Could not fetch complete route information for this train'
          },
          { status: 404 }
        );
      }
      
      // Assemble RouteDetails object
      const routeDetails: RouteDetails = {
        gtfsId,
        geometry, // The encoded polyline string
        stops: trainDetails.stops // Array of TrainStop objects
      };
      
      console.log(`✅ Successfully fetched route details for ${gtfsId}:`, {
        geometryLength: geometry.length,
        stopsCount: trainDetails.stops.length
      });
      
      // Cache the result
      try {
        await redisClient.set(
          cacheKey,
          JSON.stringify(routeDetails),
          { EX: ROUTE_CACHE_TTL_SECONDS }
        );
        console.log(`💾 Cached route details for ${gtfsId} with TTL ${ROUTE_CACHE_TTL_SECONDS}s`);
      } catch (cacheError) {
        console.warn(`Failed to cache route details for ${gtfsId}:`, cacheError);
      }
      
      return NextResponse.json(routeDetails, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Cache-Status': 'MISS',
          'X-Cache-Type': 'ROUTE',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
    } catch (apiError) {
      console.error(`Failed to fetch route data from MÁV APIs for ${gtfsId}:`, apiError);
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch route data',
          details: apiError instanceof Error ? apiError.message : 'Unknown error'
        },
        { status: 502 }
      );
    }
    
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