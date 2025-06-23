import { NextRequest, NextResponse } from 'next/server';
import { mavApi } from '@/lib/api/mav';
import { transformMavTrain } from '@/lib/api/transformers';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const boundsStr = searchParams.get('bounds');
    
    let bounds;
    if (boundsStr) {
      try {
        bounds = JSON.parse(boundsStr);
      } catch (e) {
        console.warn('Invalid bounds parameter:', boundsStr);
      }
    }
    
    console.log('Fetching real-time train data from MÁV...');
    
    // Get real-time train positions from MÁV EMMA API
    const mavTrains = await mavApi.getTrainPositions(bounds);
    
    // Transform MÁV data to our format
    const trains = mavTrains
      .filter(train => train.UtolsoGPS) // Only include trains with GPS data
      .map(transformMavTrain);
    
    console.log(`Fetched ${trains.length} trains from MÁV API`);
    
    return NextResponse.json(trains, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error) {
    console.error('Error fetching trains from MÁV:', error);
    
    // Return error response but don't crash the API
    return NextResponse.json(
      { error: 'Failed to fetch train data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}