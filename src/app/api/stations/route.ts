import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';
import { MavStation } from '@/lib/api/mav';
import { transformMavStation } from '@/lib/api/transformers';
import { Station } from '@/types';
import { loadGtfsStations } from '@/lib/gtfs/stations';
import { withTimeout } from '@/lib/trainSnapshot';

/**
 * Station list written by earlier versions of the site (fetched from MÁV's OTP
 * backend, which now IP-blocks this server, and cached for 7 days). Still real
 * data, so it is read while it lasts; nothing writes it any more.
 */
const LEGACY_CACHE_KEY = 'cache:stations:all';

// Keeps a Redis outage or a missing GTFS list from costing a Redis round trip
// and a loud log line on every page view.
const MEMORY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
// The fallback is remembered briefly, so the real list is picked up soon after
// the worker has loaded GTFS.
const FALLBACK_MEMORY_TTL_MS = 15 * 60 * 1000; // 15 minutes

// A search for "a" matches most of the network; there is no point shipping - or
// rendering - thousands of rows into a dropdown.
const MAX_SEARCH_RESULTS = 100;

type StationSource = 'gtfs' | 'cache' | 'fallback';

let memoryCache: { stations: Station[]; source: StationSource; expiresAt: number } | null = null;

// Known-good positions for the busiest stations. Used only when neither the GTFS
// list nor a cached list is available, so the map is not empty.
const FALLBACK_STATIONS: MavStation[] = [
  { UicKod: '1:005510017', Nev: 'Budapest-Keleti', GPS: { Lat: 47.500278, Lng: 19.084167 } },
  { UicKod: '1:005510033', Nev: 'Budapest-Nyugati', GPS: { Lat: 47.510833, Lng: 19.0575 } },
  { UicKod: '1:005501016', Nev: 'Budapest-Déli', GPS: { Lat: 47.498889, Lng: 19.025 } },
  { UicKod: '1:005501024', Nev: 'Budapest-Kelenföld', GPS: { Lat: 47.464444, Lng: 19.02 } },
  { UicKod: '1:005513912', Nev: 'Debrecen', GPS: { Lat: 47.520278, Lng: 21.628611 } },
  { UicKod: '1:005517228', Nev: 'Szeged', GPS: { Lat: 46.239722, Lng: 20.143056 } },
  { UicKod: '1:005507294', Nev: 'Pécs', GPS: { Lat: 46.065833, Lng: 18.223611 } },
  { UicKod: '1:005501289', Nev: 'Győr', GPS: { Lat: 47.681944, Lng: 17.634722 } },
  { UicKod: '1:005514019', Nev: 'Nyíregyháza', GPS: { Lat: 47.946667, Lng: 21.705556 } },
  { UicKod: '1:005511387', Nev: 'Miskolc-Tiszai', GPS: { Lat: 48.098719, Lng: 20.810916 } },
  { UicKod: '1:004302246', Nev: 'Szombathely', GPS: { Lat: 47.237778, Lng: 16.6325 } },
  { UicKod: '1:005504747', Nev: 'Keszthely', GPS: { Lat: 46.758333, Lng: 17.248056 } },
  { UicKod: '1:005503947', Nev: 'Veszprém', GPS: { Lat: 47.118889, Lng: 17.91 } },
  { UicKod: '1:005504689', Nev: 'Ukk', GPS: { Lat: 47.041944, Lng: 17.195833 } },
  { UicKod: '1:005504598', Nev: 'Tapolca', GPS: { Lat: 46.877778, Lng: 17.428611 } },
  { UicKod: '1:005504416', Nev: 'Balatonfüred', GPS: { Lat: 46.955833, Lng: 17.883056 } },
  { UicKod: '1:005503350', Nev: 'Siófok', GPS: { Lat: 46.907778, Lng: 18.053889 } },
  { UicKod: '1:004302725', Nev: 'Sopron', GPS: { Lat: 47.677778, Lng: 16.587222 } },
  { UicKod: '1:005501131', Nev: 'Tatabánya', GPS: { Lat: 47.585556, Lng: 18.393056 } },
  { UicKod: '1:005501511', Nev: 'Esztergom', GPS: { Lat: 47.7775, Lng: 18.743611 } },
  { UicKod: '1:005513748', Nev: 'Szolnok', GPS: { Lat: 47.179167, Lng: 20.175833 } },
  { UicKod: '1:005518036', Nev: 'Békéscsaba', GPS: { Lat: 46.669722, Lng: 21.081667 } },
  { UicKod: '1:005512401', Nev: 'Eger', GPS: { Lat: 47.891667, Lng: 20.381667 } },
  { UicKod: '1:005506288', Nev: 'Kaposvár', GPS: { Lat: 46.352778, Lng: 17.795 } },
  { UicKod: '1:005517111', Nev: 'Kecskemét', GPS: { Lat: 46.913889, Lng: 19.700833 } },
  { UicKod: '1:005503624', Nev: 'Nagykanizsa', GPS: { Lat: 46.440833, Lng: 16.986667 } },
  { UicKod: '1:005503269', Nev: 'Székesfehérvár', GPS: { Lat: 47.183611, Lng: 18.424722 } },
  { UicKod: '1:005504895', Nev: 'Zalaegerszeg', GPS: { Lat: 46.833056, Lng: 16.848333 } },
  { UicKod: '1:005502121', Nev: 'Pápa', GPS: { Lat: 47.340556, Lng: 17.458889 } },
  { UicKod: '1:005510447', Nev: 'Vác', GPS: { Lat: 47.782778, Lng: 19.133056 } },
  { UicKod: '1:005513722', Nev: 'Cegléd', GPS: { Lat: 47.182778, Lng: 19.806111 } },
  { UicKod: '1:005511205', Nev: 'Hatvan', GPS: { Lat: 47.663611, Lng: 19.671389 } },
  { UicKod: '1:005513482', Nev: 'Sátoraljaújhely', GPS: { Lat: 48.385833, Lng: 21.657778 } },
  { UicKod: '1:005503566', Nev: 'Balatonszentgyörgy', GPS: { Lat: 46.692778, Lng: 17.288889 } },
  { UicKod: '1:005506189', Nev: 'Dombóvár', GPS: { Lat: 46.37, Lng: 18.149722 } },
];

async function readLegacyCache(): Promise<Station[] | null> {
  try {
    const cached = await withTimeout(
      redisClient.get(LEGACY_CACHE_KEY) as Promise<string | null>,
      'legacy station cache',
      2000
    );
    if (!cached) return null;
    const stations = JSON.parse(cached) as Station[];
    return Array.isArray(stations) && stations.length > 0 ? stations : null;
  } catch (error) {
    console.error('Failed to read the legacy station cache from Redis:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search');

  // MÁV's GTFS feed is the primary station source: every stop with coordinates,
  // refreshed by the worker, no upstream call per request. Then whatever an
  // earlier version cached, then the hardcoded list below.
  let stations: Station[] | null = await withTimeout(loadGtfsStations(redisClient), 'gtfs stations', 2000).catch(() => null);
  let source: StationSource = 'gtfs';
  let cacheHit = stations !== null;

  if (!stations && memoryCache && memoryCache.expiresAt > Date.now()) {
    stations = memoryCache.stations;
    source = memoryCache.source;
    cacheHit = true;
  }

  if (!stations) {
    stations = await readLegacyCache();
    if (stations) {
      source = 'cache';
      cacheHit = true;
      memoryCache = { stations, source, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS };
    }
  }

  if (!stations) {
    // LOUD. A silent fallback to 35 hardcoded stations is how this went
    // unnoticed for months.
    console.error(
      '🚨 No GTFS station list in Redis (is the worker running with MAV_GTFS_USER / MAV_GTFS_PASSWORD?) ' +
      `and no cached list - serving the hardcoded fallback of ${FALLBACK_STATIONS.length} stations.`
    );
    stations = FALLBACK_STATIONS.map(transformMavStation);
    source = 'fallback';
    cacheHit = false;
    memoryCache = { stations, source, expiresAt: Date.now() + FALLBACK_MEMORY_TTL_MS };
  }

  let result = stations;

  if (search) {
    const searchLower = search.toLowerCase();
    result = result
      .filter((station: Station) => station.name.toLowerCase().includes(searchLower))
      .slice(0, MAX_SEARCH_RESULTS);
  }

  return NextResponse.json(result, {
    headers: {
      'X-Cache-Status': cacheHit ? 'HIT' : 'MISS',
      'X-Data-Source': source,
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    }
  });
}
