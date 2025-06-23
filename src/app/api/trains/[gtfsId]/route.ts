import { NextRequest, NextResponse } from 'next/server';
import { mavApi } from '@/lib/api/mav';
import { transformMavTrain } from '@/lib/api/transformers';

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
    
    // First try to find the train in live train data
    try {
      const liveTrains = await mavApi.getTrainPositions();
      const liveTrain = liveTrains.find(t => t.gtfsId === gtfsId);
      
      if (liveTrain) {
        console.log(`✅ Found live train for ${gtfsId}`);
        const train = transformMavTrain(liveTrain);
        
        // Try to fetch enhanced details including route/timetable
        try {
          console.log(`🔍 Fetching enhanced details for ${gtfsId}`);
          const trainDetails = await mavApi.getTrainDetails(gtfsId);
          
          if (trainDetails) {
            console.log(`✅ Found enhanced details with ${trainDetails.stops.length} stops`);
            // Convert TrainDetails to route format that the UI expects
            const route = trainDetails.stops.map(stop => ({
              station: {
                id: '',
                name: stop.name,
                coordinates: { latitude: 0, longitude: 0 }
              },
              arrival: stop.scheduledArrival,
              departure: stop.scheduledDeparture,
              platform: stop.platform || undefined,
              delay: stop.arrivalDelay
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
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }
    } catch (error) {
      console.warn(`Failed to find live train for ${gtfsId}, trying train details:`, error);
    }
    
    // If not found in live data, return 404 for now
    // Later we could implement a fallback to construct train object from gtfsId
    console.warn(`Train not found for gtfsId: ${gtfsId}`);
    return NextResponse.json(
      { error: 'Train not found', details: `Train with gtfsId "${gtfsId}" is not currently active` },
      { status: 404 }
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