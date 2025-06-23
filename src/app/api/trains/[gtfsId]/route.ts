import { NextRequest, NextResponse } from 'next/server';
import { mavApi } from '@/lib/api/mav';

interface RouteParams {
  params: {
    gtfsId: string;
  };
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

    console.log(`🔍 Fetching trip details for ${gtfsId} via server API`);
    
    // Get detailed trip information from MÁV API server-side
    const trainDetails = await mavApi.getTrainDetails(gtfsId);
    
    if (!trainDetails) {
      return NextResponse.json(
        { error: 'Trip details not found' },
        { status: 404 }
      );
    }

    console.log(`✅ Retrieved trip details for ${gtfsId}: ${trainDetails.stops.length} stops`);
    
    return NextResponse.json(trainDetails, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
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