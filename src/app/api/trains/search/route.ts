import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';
import { Train, TrainSearchResult } from '@/types';
import { REDIS_READ_TIMEOUT_MS, TRAIN_HASH_KEY, withTimeout } from '@/lib/trainSnapshot';
import { featuredTrains, searchTrains } from '@/lib/trains/search';

const MAX_RESULTS = 20;
const MAX_FEATURED = 10;

/**
 * Search covers the trains that are running right now - the worker's live hash -
 * and nothing else: there is no timetable behind it. The response body keeps
 * its TrainSearchResult[] shape; the headers say what was searched.
 *
 * `origin.time`, `destination.time` and `durationMinutes` are placeholders: the
 * live hash has positions, not schedules. They are only in the body because the
 * TrainSearchResult shape requires them.
 */
function toSearchResult(train: Train): TrainSearchResult {
  return {
    gtfsId: train.gtfsId || train.id,
    trainNumber: train.number,
    trainName: train.trainName || undefined,
    trainType: train.type,
    origin: {
      name: train.origin?.name || 'Unknown',
      time: new Date(),
    },
    destination: {
      name: train.destination?.name || 'Unknown',
      time: new Date(),
    },
    durationMinutes: 120,
    liveDelayMinutes: train.delay,
    isActive: true, // everything in the live hash is running
  };
}

function parseTrains(hash: Record<string, string>): Train[] {
  const trains: Train[] = [];
  for (const raw of Object.values(hash)) {
    try {
      trains.push(JSON.parse(raw) as Train);
    } catch {
      // One unreadable entry must not fail the search.
    }
  }
  return trains;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q')?.trim() || '';
    const fromStationId = searchParams.get('fromStationId');
    const toStationId = searchParams.get('toStationId');
    const featured = searchParams.get('featured') === 'true';

    if (!featured && !q && !fromStationId && !toStationId) {
      return NextResponse.json(
        { error: 'Search query "q" parameter is required' },
        { status: 400 }
      );
    }

    const trainHash = await withTimeout(
      redisClient.hGetAll(TRAIN_HASH_KEY) as Promise<Record<string, string>>,
      `Redis hGetAll(${TRAIN_HASH_KEY})`,
      REDIS_READ_TIMEOUT_MS
    );
    let trains = parseTrains(trainHash || {});

    const identified = trains.filter(train => train.category).length;
    const headers = {
      'Cache-Control': 'public, max-age=60', // 1 minute cache (data is real-time)
      'X-Cache-Source': 'REDIS_HASH',
      // Honest about scope: only trains running now are searchable, and a
      // category filter ("IC") only sees trains whose category is known yet.
      'X-Search-Scope': 'live-trains',
      'X-Train-Count': String(trains.length),
      'X-Trains-Identified': `${identified}/${trains.length}`,
    };

    if (trains.length === 0) {
      console.warn('No live trains cached - search returns nothing');
      return NextResponse.json([], { headers });
    }

    let results: TrainSearchResult[];
    if (featured) {
      results = featuredTrains(trains, MAX_FEATURED).map(toSearchResult);
    } else {
      // Station filters use the GTFS ids the worker gives each end of a train.
      if (fromStationId) trains = trains.filter(train => train.origin?.id === fromStationId);
      if (toStationId) trains = trains.filter(train => train.destination?.id === toStationId);
      results = q
        ? searchTrains(trains, q, MAX_RESULTS).map(hit => toSearchResult(hit.train))
        : [...trains]
            .sort((a, b) => a.number.localeCompare(b.number, 'hu', { numeric: true }))
            .slice(0, MAX_RESULTS)
            .map(toSearchResult);
    }

    console.log(`Train search ${featured ? '(featured)' : JSON.stringify(q)}: ${results.length} of ${trains.length} live trains`);
    return NextResponse.json(results, { headers });
  } catch (error) {
    console.error('Error searching trains:', error);

    return NextResponse.json(
      {
        error: 'Failed to search trains',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
