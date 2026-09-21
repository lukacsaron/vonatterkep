import { NextRequest, NextResponse } from 'next/server';
import { mavApi } from '@/lib/api/mav';
import { transformMavTrain } from '@/lib/api/transformers';
import { redisClient } from '@/lib/redis';
import { Train } from '@/types';
import { attachStationData, loadGtfsIndex } from '@/lib/gtfs/stations';
import { withTimeout } from '@/lib/trainSnapshot';

const HASH_KEY = 'trains:live';

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

    console.log(`🔍 Fetching train for gtfsId: ${gtfsId}`);
    
    // First check Redis HASH for cached train data
    try {
      const cachedTrainStr = await redisClient.hGet(HASH_KEY, gtfsId);
      
      if (cachedTrainStr) {
        console.log(`✅ Found train in Redis HASH for ${gtfsId}`);
        const train: Train = JSON.parse(cachedTrainStr);
        
        // Try to fetch enhanced details including route/timetable
        try {
          console.log(`🔍 Fetching enhanced details for ${gtfsId}`);
          const trainDetails = await mavApi.getTrainDetails(gtfsId);
          
          if (trainDetails) {
            console.log(`✅ Found enhanced details with ${trainDetails.stops.length} stops`);
            // Convert TrainDetails to route format that the UI expects
            // Stops from vonatinfo have names but no coordinates; take them from GTFS.
            const gtfsIndex = await withTimeout(loadGtfsIndex(redisClient), 'gtfs station index', 2000).catch(() => null);
            const stops = gtfsIndex ? attachStationData(trainDetails.stops, gtfsIndex.byName).stops : trainDetails.stops;
            const route = stops.map(stop => ({
              station: {
                id: stop.id || '',
                name: stop.name,
                coordinates: stop.coordinates
              },
              arrival: stop.scheduledArrival,
              departure: stop.scheduledDeparture,
              actualArrival: stop.actualArrival,
              actualDeparture: stop.actualDeparture,
              platform: stop.platform || undefined,
              delay: stop.arrivalDelay,
              isPassed: stop.isPassed
            }));
            
            // Add enhanced details to train object
            train.route = route;
            train.trainName = trainDetails.trainName;
          } else {
            console.warn(`⚠️ No enhanced details found for ${gtfsId}`);
          }
        } catch (detailsError) {
          console.warn(`Failed to fetch enhanced details for ${gtfsId}:`, detailsError);
        }
        
        return NextResponse.json(train, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Cache-Status': 'HIT',
            'X-Cache-Type': 'HASH',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }
    } catch (redisError) {
      console.warn(`Failed to check Redis HASH for ${gtfsId}:`, redisError);
    }
    
    // Train not found in cache - return 404 without calling external APIs
    console.warn(`Train not found in cache for gtfsId: ${gtfsId}`);
    return NextResponse.json(
      { 
        error: 'Train not found', 
        details: `Train with gtfsId "${gtfsId}" is not currently active or cached. Only live trains are available.` 
      },
      { 
        status: 404,
        headers: {
          'X-Cache-Source': 'REDIS_HASH_ONLY'
        }
      }
    );
    
  } catch (error) {
    console.error(`Error fetching trip details:`, error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch trip details', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}