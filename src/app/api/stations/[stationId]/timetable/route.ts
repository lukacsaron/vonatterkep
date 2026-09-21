import { NextRequest, NextResponse } from 'next/server';
import { mavApi, MavArrival, MavDeparture } from '@/lib/api/mav';
import { transformMavDeparture, transformMavArrival } from '@/lib/api/transformers';
import { redisClient } from '@/lib/redis';
import { findStationByName, loadGtfsIndex } from '@/lib/gtfs/stations';
import { vonatinfoDateParam } from '@/lib/time/budapest';
import { withTimeout } from '@/lib/trainSnapshot';
import { Station } from '@/types';

interface RouteParams {
  params: Promise<{
    stationId: string;
  }>;
}

// Cache for timetable data (5-10 minutes as specified)
const timetableCache = new Map<string, { data: any[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// One vonatinfo board carries BOTH arrivals and departures, so cache the board:
// switching tabs on the station page must not cost a second upstream request.
const boardCache = new Map<string, { board: { departures: MavDeparture[]; arrivals: MavArrival[] }; timestamp: number }>();

const REDIS_TIMEOUT_MS = 2000;

/**
 * Station id -> station. GTFS ids first (the station list is built from the
 * MÁV GTFS feed). Ids from earlier versions of the site - OTP gtfsIds such as
 * "1:005510017", still in bookmarks and search indexes - are resolved through
 * the old station cache and then mapped onto the GTFS station of the same name.
 */
async function resolveStation(stationId: string): Promise<Station | null> {
  const index = await withTimeout(loadGtfsIndex(redisClient), 'gtfs station index', REDIS_TIMEOUT_MS).catch(() => null);
  const fromGtfs = index?.byId.get(stationId);
  if (fromGtfs) return fromGtfs;

  try {
    const raw = await withTimeout(redisClient.get('cache:stations:all') as Promise<string | null>, 'legacy station cache', REDIS_TIMEOUT_MS);
    const legacy = raw ? (JSON.parse(raw) as Station[]).find(station => station.id === stationId) : undefined;
    if (legacy) return (index && findStationByName(index.byName, legacy.name)) || legacy;
  } catch (error) {
    console.warn(`Legacy station lookup failed for ${stationId}:`, error);
  }
  return null;
}

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
    // Budapest calendar date: the UTC date is a different day for two hours each night.
    const boardDay = vonatinfoDateParam(queryDate);
    const cacheKey = `${stationId}-${type}-${boardDay}`;
    
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
    
    const stationData = await resolveStation(stationId);
    if (!stationData) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    // vonatinfo.mav.hu serves the board by station NAME. The old MobileService
    // host (getDepartures/getArrivals) is dead and the OTP host is IP-blocked.
    const boardKey = `${stationData.id}-${boardDay}`;
    let board = boardCache.get(boardKey);
    if (!board || now - board.timestamp >= CACHE_DURATION) {
      board = { board: await mavApi.getStationBoardFromVonatinfo(stationData.name, queryDate), timestamp: now };
      boardCache.set(boardKey, board);
    }

    const timetableData = type === 'departures'
      ? board.board.departures.map(departure => transformMavDeparture(departure, stationData))
      : board.board.arrivals.map(arrival => transformMavArrival(arrival, stationData));
    
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
    for (const [key, value] of boardCache.entries()) {
      if (now - value.timestamp > CACHE_DURATION * 2) {
        boardCache.delete(key);
      }
    }
    
    console.log(`✅ Retrieved ${timetableData.length} ${type} for station ${stationData.name}`);
    
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