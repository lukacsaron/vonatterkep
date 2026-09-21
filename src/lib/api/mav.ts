// MÁV API integration based on reference implementations
import { TrainDetails, TrainStop } from '../../types';
import { parseUIC } from '../uicParser';
import { budapestToday, vonatinfoDateParam } from '../time/budapest';
import { CalendarDate, createRouteSequencer, nearestTo, atDay, parseClock } from '../time/wallClock';

// Constants from reference implementations
//
// DEAD HOST. vim.mav-start.hu was MAV's old MobileService endpoint. It now answers
// 404 over https and 500 over http and there is no replacement host, so every call
// below that still points at it (getDepartures / getArrivals) is expected to fail.
// Station data no longer comes from here - see getStations(), which uses the OTP
// GraphQL API instead.
const MAV_MOBILE_API_BASE = 'http://vim.mav-start.hu/VIM/PR/150225/MobileService.svc/rest';

// The live MAV OpenTripPlanner 2 index API. This is the only upstream that still
// works, and it is rate limited per host - see otpGraphQLRequest().
// MÁV's own public train tracker. Unlike mavplusz.hu (the MÁVPlusz/EMMA OTP
// backend) this host does not IP-block our server, and one 9 KB request returns
// every running train with its delay already attached.
const MAV_VONATINFO_API = 'https://vonatinfo.mav.hu/map.aspx/getData';

const MAV_EMMA_API_BASE = 'https://mavplusz.hu/otp2-backend/otp/routers/default/index/graphql';

// Authentication tokens from reference implementations
const MAV_UAID = '2Juija1mabqr24Blkx1qkXxJ105j'; // From mav library
const MAV_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'; // Exact from holavonat-app

// GTFS feed id of MAV's own (railway) feed inside the shared OTP instance. The same
// instance also serves BKK, regional bus operators etc., which we do not want.
const MAV_GTFS_FEED_ID = '1';

// Bounding box for the station query. Slightly wider than Hungary so that border
// stations served by MAV trains (Wien, Kittsee, Cakovec, ...) are included.
const MAV_STATION_BOUNDS = {
  south: 45.5,
  west: 16.0,
  north: 48.7,
  east: 23.0
};

// No upstream call may hang forever - the worker and the request handlers both
// depend on these resolving.
const OTP_REQUEST_TIMEOUT_MS = 20000;

// mavplusz.hu rate limits per host and answers 403 with the body "host limit
// achived" once tripped. Retrying immediately keeps the limit permanently tripped,
// so after a 403/429 we stop calling upstream entirely for this long and let
// callers fall back to cached data.
const OTP_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;

let otpRateLimitedUntil = 0;

export class OtpRateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpRateLimitedError';
  }
}

export function isOtpRateLimited(): boolean {
  return Date.now() < otpRateLimitedUntil;
}

/**
 * Single choke point for every OTP GraphQL call.
 *
 * - times every request out (no unbounded hangs)
 * - turns HTTP 403/429 into a process-wide cooldown so we never tight-loop on the
 *   host rate limit, and logs the upstream body because it explains itself
 * - surfaces GraphQL-level errors instead of silently returning undefined data
 */
async function otpGraphQLRequest<T>(query: string, label: string): Promise<T> {
  if (isOtpRateLimited()) {
    const waitSeconds = Math.ceil((otpRateLimitedUntil - Date.now()) / 1000);
    throw new OtpRateLimitedError(
      `Skipping ${label}: MAV OTP API is rate limited, backing off for another ${waitSeconds}s`
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OTP_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(MAV_EMMA_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': MAV_USER_AGENT,
      },
      body: JSON.stringify({ query }),
      signal: controller.signal
    });

    if (response.status === 403 || response.status === 429) {
      const body = await response.text().catch(() => '<unreadable body>');
      otpRateLimitedUntil = Date.now() + OTP_RATE_LIMIT_COOLDOWN_MS;
      console.error(
        `🚫 MAV OTP API rate limited on ${label}: HTTP ${response.status} - ${body.trim().slice(0, 200)}. ` +
        `Pausing all upstream calls for ${OTP_RATE_LIMIT_COOLDOWN_MS / 1000}s and serving cached data.`
      );
      throw new OtpRateLimitedError(`MAV OTP API returned ${response.status} for ${label}`);
    }

    if (!response.ok) {
      throw new Error(`MAV OTP API error on ${label}: HTTP ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };

    if (json.errors && json.errors.length > 0) {
      throw new Error(
        `MAV OTP API returned GraphQL errors on ${label}: ${json.errors.map(e => e.message).join('; ')}`
      );
    }

    if (!json.data) {
      throw new Error(`MAV OTP API returned no data on ${label}`);
    }

    return json.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`MAV OTP API timed out after ${OTP_REQUEST_TIMEOUT_MS}ms on ${label}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export interface MavStation {
  Nev: string;
  UicKod: string;
  GPS?: {
    Lat: number;
    Lng: number;
  };
  /** Platform codes reported by the OTP feed, when the station exposes any. */
  Vaganyok?: string[];
}

interface OtpStop {
  gtfsId: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
  platformCode: string | null;
  parentStation: {
    gtfsId: string;
    name: string | null;
    lat: number | null;
    lon: number | null;
  } | null;
}

export interface MavTrain {
  VonatSzam: string;
  Tipus: string;
  Celallomas: string;
  /** Origin station name, when the source gives one (vonatinfo @Relation). */
  Kiindulas?: string;
  UtolsoGPS?: {
    Lat: number;
    Lng: number;
    Ido: string;
    Sebesseg: number;
    Irany: number;
  };
  Keses: number;
  gtfsId?: string; // For delay lookup
  trainName?: string; // Route name like S60
  vehicleId?: string; // Raw vehicle ID for UIC parsing
  uicInfo?: import('../../types/trainTypes').UICParseResult; // UIC parsing result
  locomotiveType?: import('../../types/trainTypes').TrainType; // Detected locomotive type
}

export interface MavDeparture {
  VonatSzam: string;
  Indulas: string;
  Celallomas: string;
  Vagany?: string;
  Keses: number;
  Tipus: string;
  /** vonatinfo ElviraID of the train, when known - same id the live feed uses as gtfsId. */
  elviraId?: string;
  /** Actual (realtime) time as an ISO instant, when reported. */
  actualTime?: string;
}

export interface MavArrival {
  VonatSzam: string;
  Erkezes: string;
  Kiindulas: string;
  Vagany?: string;
  Keses: number;
  Tipus: string;
  /** vonatinfo ElviraID of the train, when known - same id the live feed uses as gtfsId. */
  elviraId?: string;
  /** Actual (realtime) time as an ISO instant, when reported. */
  actualTime?: string;
}

class MavApiClient {
  /**
   * Every railway station MAV knows about, with real coordinates.
   *
   * Source: the OTP GraphQL index API, one single bulk query. The old
   * MobileService station endpoint (GetAlapadatok) is dead - see
   * MAV_MOBILE_API_BASE - and used to leave every station at 0,0.
   *
   * Cost: exactly ONE upstream request per call. Callers are expected to cache
   * the result (see /api/stations, which keeps it in Redis for days); station
   * geometry changes a handful of times a year.
   */
  async getStations(): Promise<MavStation[]> {
    const { south, west, north, east } = MAV_STATION_BOUNDS;

    // stopsByBbox is the only stop query on this schema that accepts a feed
    // filter, which is what keeps us from downloading ~72k BKK/coach stops.
    const stopsQuery = `{
      stopsByBbox(minLat: ${south}, minLon: ${west}, maxLat: ${north}, maxLon: ${east}, feeds: ["${MAV_GTFS_FEED_ID}"]) {
        gtfsId
        name
        lat
        lon
        platformCode
        parentStation {
          gtfsId
          name
          lat
          lon
        }
      }
    }`;

    console.log('🏢 Fetching stations from MAV OTP GraphQL API (single bulk query)...');

    const data = await otpGraphQLRequest<{ stopsByBbox: OtpStop[] | null }>(stopsQuery, 'getStations');
    const stops = data.stopsByBbox || [];

    if (stops.length === 0) {
      throw new Error('MAV OTP API returned 0 stops for the MAV feed - refusing to treat that as a station list');
    }

    // The feed lists one entry per platform. Collapse them onto their parent
    // station so we end up with stations, not platforms.
    const byStation = new Map<string, { name: string; lat: number; lon: number; platforms: Set<string> }>();

    for (const stop of stops) {
      const parent = stop.parentStation;
      const id = parent?.gtfsId || stop.gtfsId;
      const name = parent?.name || stop.name;
      const lat = parent?.lat ?? stop.lat;
      const lon = parent?.lon ?? stop.lon;

      // No name or no usable position means we cannot place it on a map, and a
      // station pinned at 0,0 is worse than a station we simply do not list.
      if (!id || !name || typeof lat !== 'number' || typeof lon !== 'number') continue;
      if (lat === 0 && lon === 0) continue;

      let entry = byStation.get(id);
      if (!entry) {
        entry = { name, lat, lon, platforms: new Set<string>() };
        byStation.set(id, entry);
      }
      if (stop.platformCode) entry.platforms.add(stop.platformCode);
    }

    const stations: MavStation[] = Array.from(byStation.entries()).map(([id, entry]) => ({
      UicKod: id,
      Nev: entry.name,
      GPS: { Lat: entry.lat, Lng: entry.lon },
      Vaganyok: entry.platforms.size > 0
        ? Array.from(entry.platforms).sort((a, b) => a.localeCompare(b, 'hu', { numeric: true }))
        : undefined
    }));

    console.log(`✅ Fetched ${stations.length} stations from OTP (${stops.length} raw stops collapsed onto parent stations)`);

    return stations;
  }

  // Get train departures for a station
  /**
   * Station timetables used to come from vim.mav-start.hu, which is dead (500/404),
   * so every station timetable request returned HTTP 500. OTP serves the same
   * information - including realtime delays - from the stop we already know about,
   * in a single request per station.
   */
  private async getStopTimes(stationId: string, limit?: number, omitNonPickups = false): Promise<any[]> {
    // How deep OTP looks per pattern. This is the upstream fetch depth, NOT the
    // number of rows returned to the caller - a terminus has many patterns.
    const DEPARTURES_PER_PATTERN = 20;
    const gtfsId = await this.resolveStopId(stationId);
    if (!gtfsId) {
      console.error(`No OTP stop found for station id "${stationId}"`);
      return [];
    }

    const query = `{
      stop(id: "${gtfsId}") {
        gtfsId
        name
        stoptimesWithoutPatterns(numberOfDepartures: ${DEPARTURES_PER_PATTERN}, omitCanceled: false, omitNonPickups: ${omitNonPickups}) {
          serviceDay
          scheduledArrival
          scheduledDeparture
          arrivalDelay
          departureDelay
          realtime
          headsign
          stop { platformCode }
          trip {
            tripShortName
            tripHeadsign
            route { shortName mode }
            stops { name }
          }
        }
      }
    }`;

    const data = await otpGraphQLRequest<{ stop: any }>(query, `getStopTimes(${gtfsId})`);
    const stoptimes: any[] = data?.stop?.stoptimesWithoutPatterns || [];
    // OTP groups rows per pattern, so they arrive out of order. Sort chronologically.
    // No truncation by default: the old MobileService returned a whole day and the
    // station page renders every row, so capping here would silently hide departures.
    const sorted = stoptimes.sort((a, b) =>
      (a.serviceDay + (a.scheduledDeparture ?? a.scheduledArrival ?? 0)) -
      (b.serviceDay + (b.scheduledDeparture ?? b.scheduledArrival ?? 0))
    );
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }

  /** Accept either an OTP gtfsId ("1:005510017") or a bare station code. */
  private async resolveStopId(stationId: string): Promise<string | null> {
    if (stationId.includes(':')) return stationId;
    const stations = await this.getStations();
    const bare = stationId.replace(/^0+/, '');
    const hit = stations.find(st => {
      const id = String(st.UicKod || '');
      const tail = id.split(':').pop() || '';
      return id === stationId || tail === stationId || tail.replace(/^0+/, '') === bare;
    });
    return hit ? String(hit.UicKod) : null;
  }

  /**
   * OTP gives seconds from midnight of serviceDay (epoch seconds). Departures
   * after midnight exceed 86400, so returning a bare HH:MM would lose the day
   * and sort a 02:00 departure before the 22:00 one that precedes it.
   */
  private static toClock(serviceDay: number, secondsFromMidnight: number | null | undefined): string {
    if (typeof secondsFromMidnight !== 'number') return '';
    return new Date((serviceDay + secondsFromMidnight) * 1000).toISOString();
  }

  private static toMinutes(seconds: number | null | undefined): number {
    return typeof seconds === 'number' ? Math.max(0, Math.round(seconds / 60)) : 0;
  }

  async getDepartures(stationId: string, _date: Date = new Date(), limit?: number): Promise<MavDeparture[]> {
    // omitNonPickups drops stoptimes you cannot board - i.e. trains that terminate
    // here. Without it a terminus lists arriving trains as departures, with the
    // station itself shown as their destination.
    const stoptimes = await this.getStopTimes(stationId, limit, true);
    return stoptimes
      .filter(st => typeof st.scheduledDeparture === 'number')
      .map(st => {
        const trip = st.trip || {};
        return {
          VonatSzam: trip.tripShortName || trip.route?.shortName || '',
          Indulas: MavApiClient.toClock(st.serviceDay, st.scheduledDeparture),
          Celallomas: st.headsign || trip.tripHeadsign || '',
          Vagany: st.stop?.platformCode || undefined,
          Keses: MavApiClient.toMinutes(st.departureDelay),
          Tipus: trip.route?.mode || 'RAIL',
        } as MavDeparture;
      });
  }

  async getArrivals(stationId: string, _date: Date = new Date(), limit?: number): Promise<MavArrival[]> {
    const stoptimes = await this.getStopTimes(stationId, limit);
    return stoptimes
      .filter(st => typeof st.scheduledArrival === 'number')
      .map(st => {
        const trip = st.trip || {};
        const stops = trip.stops || [];
        return {
          VonatSzam: trip.tripShortName || trip.route?.shortName || '',
          Erkezes: MavApiClient.toClock(st.serviceDay, st.scheduledArrival),
          Kiindulas: stops.length ? (stops[0]?.name || '') : '',
          Vagany: st.stop?.platformCode || undefined,
          Keses: MavApiClient.toMinutes(st.arrivalDelay),
          Tipus: trip.route?.mode || 'RAIL',
        } as MavArrival;
      });
  }

  // Generic method to get both departures and arrivals
  async getTimetable(stationId: string, type: 'departures' | 'arrivals', date: Date = new Date()): Promise<MavDeparture[] | MavArrival[]> {
    if (type === 'departures') {
      return this.getDepartures(stationId, date);
    } else {
      return this.getArrivals(stationId, date);
    }
  }

  // Get full trip details including all stops and delays
  async getTrainDetails(gtfsId: string): Promise<TrainDetails | null> {
    // vonatinfo first: it is reachable from this server (the OTP host is
    // IP-blocked) and ids stored as gtfsId are ElviraIDs, which is what it
    // expects. Without this /api/trains/[gtfsId] returns a train with no route
    // and the slide-in shows no timetable at all.
    try {
      const viaVonatinfo = await this.getRouteDetailsFromVonatinfo(gtfsId);
      if (viaVonatinfo && viaVonatinfo.stops.length > 0) {
        const stops = viaVonatinfo.stops;
        const last = stops[stops.length - 1];
        // Overall delay: the latest real delay seen along the route so far.
        const passed = stops.filter(st => st.isPassed);
        const overallDelay = passed.length
          ? (passed[passed.length - 1].arrivalDelay || passed[passed.length - 1].departureDelay || 0)
          : 0;
        return {
          destination: last?.name || '',
          overallDelay,
          stops,
        };
      }
    } catch (error) {
      console.warn(`vonatinfo trip lookup failed for ${gtfsId}:`, error);
    }

    try {
      const today = new Date();
      const serviceDay = today.toISOString().split('T')[0]; // "YYYY-MM-DD" format like holavonat
      
      const tripQuery = `{ 
        trip(id: "${gtfsId}", serviceDay: "${serviceDay}") { 
          tripHeadsign
          trainCategoryName
          trainName
          route {
            longName(language: "hu")
            shortName
          }
          stoptimes { 
            arrivalDelay 
            realtimeArrival 
            scheduledArrival
            realtimeDeparture
            scheduledDeparture
            stop { 
              gtfsId
              name 
              lat 
              lon 
              platformCode
              parentStation { gtfsId }
            }
          } 
        } 
      }`;

      const data = await otpGraphQLRequest<any>(tripQuery, `getTrainDetails(${gtfsId})`);

      const trip = data?.trip;
      
      // Debug TÓPART train specifically
      if (trip?.trainName?.includes('TÓPART') || trip?.tripHeadsign?.includes('TÓPART')) {
        console.log('TÓPART train data:', {
          gtfsId,
          serviceDay,
          tripHeadsign: trip.tripHeadsign,
          trainName: trip.trainName,
          stoptimesCount: trip.stoptimes?.length,
          firstStopExample: trip.stoptimes?.[0],
          lastStopExample: trip.stoptimes?.[trip.stoptimes?.length - 1]
        });
      }
      
      if (!trip || !trip.stoptimes) {
        console.warn(`🚨 No trip data found for ${gtfsId}:`, { trip, hasStoptimes: !!trip?.stoptimes });
        return null;
      }

      console.log(`✅ Found trip with ${trip.stoptimes.length} stops`);

      // Calculate current delay and time logic like holavonat
      let maxDelay = 0;
      const now = new Date();
      
      // LAST RESORT: Manually subtract 2 hours from all API times
      // This is a brute force fix since EMMA API seems to return times 2 hours ahead
      const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const sinceMidnight = (now.getTime() - localMidnight.getTime()) / 1000;
      
      console.log('LAST RESORT - Manual 2h adjustment approach:', {
        currentTime: now.toString(),
        localMidnight: localMidnight.toISOString(),
        sinceMidnight,
        currentTimeHours: sinceMidnight / 3600,
        adjustment: 'Subtracting 2 hours (7200 seconds) from all API times'
      });
      
      const stops: TrainStop[] = trip.stoptimes.map((stoptime: any, index: number) => {
        const arrivalDelay = stoptime.arrivalDelay || 0;
        const departureDelay = 0; // Not available in this API
        const stopDelay = arrivalDelay; // Use arrival delay like holavonat
        maxDelay = Math.max(maxDelay, Math.abs(stopDelay));

        // Convert times from seconds since midnight to actual Date objects for today
        // LAST RESORT: Manually subtract 2 hours (7200 seconds) from API times
        const twoHours = 2 * 3600; // 7200 seconds = 2 hours
        const scheduledArrival = stoptime.scheduledArrival ? new Date(localMidnight.getTime() + (stoptime.scheduledArrival - twoHours) * 1000) : undefined;
        const realtimeArrival = stoptime.realtimeArrival ? new Date(localMidnight.getTime() + (stoptime.realtimeArrival - twoHours) * 1000) : undefined;
        const scheduledDeparture = stoptime.scheduledDeparture ? new Date(localMidnight.getTime() + (stoptime.scheduledDeparture - twoHours) * 1000) : undefined;
        const realtimeDeparture = stoptime.realtimeDeparture ? new Date(localMidnight.getTime() + (stoptime.realtimeDeparture - twoHours) * 1000) : undefined;

        // Debug time conversion for specific trains (add BALATON for current test)
        if (trip.trainName?.includes('TÓPART') || trip.tripHeadsign?.includes('TÓPART') || 
            trip.tripShortName?.includes('34924') || trip.tripShortName?.includes('19785') || 
            trip.tripShortName?.includes('875') || trip.trainName?.includes('BALATON') ||
            gtfsId.includes('34924') || gtfsId.includes('19785') || gtfsId.includes('875')) {
          console.log('LAST RESORT - Manual 2h adjustment debug:', {
            trainId: trip.tripShortName || 'unknown',
            stopName: stoptime.stop.name,
            rawScheduledArrivalSeconds: stoptime.scheduledArrival,
            adjustedScheduledArrivalSeconds: stoptime.scheduledArrival - twoHours,
            scheduledArrivalTime: scheduledArrival?.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest' }),
            localMidnight: localMidnight.toISOString(),
            currentTime: now.toISOString(),
            sinceMidnight: sinceMidnight,
            currentTimeHours: sinceMidnight / 3600
          });
        }

        // Determine if stop is in the past (improved logic)
        // Use the later of realtime or scheduled departure time to determine if passed
        const departureTime = stoptime.realtimeDeparture || stoptime.scheduledDeparture || 0;
        const arrivalTime = stoptime.realtimeArrival || stoptime.scheduledArrival || 0;
        
        // A stop is considered "passed" if:
        // 1. It has a departure time AND that time is more than 5 minutes ago (to account for brief stops)
        // 2. OR it only has arrival time AND that was more than 10 minutes ago
        // LAST RESORT: Account for the 2-hour manual adjustment
        let isPassed = false;
        if (departureTime > 0) {
          const adjustedDepartureTime = departureTime - twoHours; // Subtract 2 hours from API time
          isPassed = adjustedDepartureTime < (sinceMidnight - 300); // 5 minutes margin for departures
        } else if (arrivalTime > 0) {
          const adjustedArrivalTime = arrivalTime - twoHours; // Subtract 2 hours from API time
          isPassed = adjustedArrivalTime < (sinceMidnight - 600); // 10 minutes margin for arrivals only
        }
        
        // Special case: if this is the first stop, it's only passed if departure was more than 5 minutes ago
        if (index === 0 && departureTime > 0) {
          const adjustedDepartureTime = departureTime - twoHours;
          isPassed = adjustedDepartureTime < (sinceMidnight - 300);
        }

        // Debug isPassed calculation for specific trains
        if (trip.trainName?.includes('TÓPART') || trip.tripHeadsign?.includes('TÓPART') || 
            trip.tripShortName?.includes('34924') || trip.tripShortName?.includes('19785') || 
            trip.tripShortName?.includes('875') || trip.trainName?.includes('BALATON') ||
            gtfsId.includes('34924') || gtfsId.includes('19785') || gtfsId.includes('875')) {
          console.log('LAST RESORT - Manual 2h adjustment isPassed debug:', {
            trainId: trip.tripShortName || 'unknown',
            stopName: stoptime.stop.name,
            departureTimeRaw: departureTime,
            departureTimeAdjusted: departureTime - twoHours,
            sinceMidnight,
            isPassed,
            currentTimeSeconds: sinceMidnight,
            departureTimeHuman: departureTime > 0 ? new Date(localMidnight.getTime() + (departureTime - twoHours) * 1000).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest' }) : 'N/A'
          });
        }

        return {
          id: stoptime.stop.parentStation?.gtfsId || stoptime.stop.gtfsId, // OTP stop id (parent station where available)
          name: stoptime.stop.name,
          scheduledArrival,
          actualArrival: realtimeArrival,
          scheduledDeparture,
          actualDeparture: realtimeDeparture,
          platform: stoptime.stop.platformCode || '', // Now available from EMMA API
          arrivalDelay: Math.round(arrivalDelay / 60), // Convert to minutes
          departureDelay: 0, // Not available
          isPassed,
          coordinates: stoptime.stop.lat && stoptime.stop.lon ? {
            latitude: stoptime.stop.lat,
            longitude: stoptime.stop.lon
          } : undefined // GPS coordinates from EMMA API
        };
      });

      return {
        destination: trip.tripHeadsign || 'Unknown',
        trainName: trip.trainName,
        routeShortName: trip.route?.shortName,
        routeLongName: trip.route?.longName,
        overallDelay: Math.round(maxDelay / 60), // Convert to minutes
        stops
      };
      
    } catch (error) {
      if (error instanceof OtpRateLimitedError) {
        // Already logged once by otpGraphQLRequest; do not retry, do not spam.
        return null;
      }
      console.warn(`Failed to get trip details for train ${gtfsId}:`, error);
      return null;
    }
  }

  // Get delay information for a specific train (simplified version)
  async getTrainDelay(gtfsId: string): Promise<number> {
    const details = await this.getTrainDetails(gtfsId);
    return details?.overallDelay || 0;
  }

  // Get train route geometry (polyline) for map visualization
  async getTrainGeometry(gtfsId: string): Promise<string | null> {
    try {
      const url = `https://mavplusz.hu/otp2-backend/otp/routers/default/index/trips/${gtfsId}/geometry`;
      console.log(`🗺️ Fetching route geometry for ${gtfsId}`);
      
      if (isOtpRateLimited()) {
        console.warn(`⏳ Skipping geometry fetch for ${gtfsId}: MAV OTP API is rate limited`);
        return null;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), OTP_REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': MAV_USER_AGENT,
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.status === 403 || response.status === 429) {
        const body = await response.text().catch(() => '<unreadable body>');
        otpRateLimitedUntil = Date.now() + OTP_RATE_LIMIT_COOLDOWN_MS;
        console.error(
          `🚫 MAV geometry API rate limited for ${gtfsId}: HTTP ${response.status} - ${body.trim().slice(0, 200)}. ` +
          `Pausing upstream calls for ${OTP_RATE_LIMIT_COOLDOWN_MS / 1000}s.`
        );
        return null;
      }

      if (!response.ok) {
        console.warn(`❌ Failed to get geometry for ${gtfsId}: ${response.status}`);
        return null;
      }

      const data = await response.json() as { points?: string };
      console.log(`✅ Got geometry for ${gtfsId}: ${data.points ? 'polyline present' : 'no polyline'}`);
      
      return data.points || null; // The encoded polyline string
    } catch (error) {
      console.error(`Failed to get geometry for ${gtfsId}:`, error);
      return null;
    }
  }

  // Search for trains based on various criteria
  async searchTrains(params: {
    q?: string;
    fromStationId?: string;
    toStationId?: string;
    date?: string;
  }): Promise<{ train: MavDeparture; fromStation: string; details?: any }[]> {
    const results: { train: MavDeparture; fromStation: string; details?: any }[] = [];
    
    try {
      // If we only have a query (like "Tópart"), search live trains first
      if (params.q && !params.fromStationId) {
        try {
          console.log(`🔍 Searching live trains for query: "${params.q}"`);
          const liveTrains = await this.getTrainPositions();
          const query = params.q.toLowerCase();
          
          for (const liveTrain of liveTrains) {
            // Check if train number or destination matches the query
            const trainMatches = liveTrain.VonatSzam.toLowerCase().includes(query) ||
                               liveTrain.Celallomas.toLowerCase().includes(query);
            
            if (trainMatches && liveTrain.gtfsId) {
              try {
                // Get detailed information for matching live trains
                const trainDetails = await this.getTrainDetails(liveTrain.gtfsId);
                if (trainDetails) {
                  // Create a departure-like object from live train data
                  const mockDeparture: MavDeparture = {
                    VonatSzam: liveTrain.VonatSzam,
                    Celallomas: liveTrain.Celallomas,
                    Indulas: new Date().toISOString(), // Use current time as fallback
                    Keses: liveTrain.Keses,
                    Vagany: '',
                    Tipus: liveTrain.Tipus
                  };
                  
                  results.push({
                    train: mockDeparture,
                    fromStation: trainDetails.stops?.[0]?.name || 'Unknown',
                    details: {
                      ...trainDetails,
                      gtfsId: liveTrain.gtfsId // Pass through the real gtfsId
                    }
                  });
                }
              } catch (error) {
                console.warn(`Failed to get details for live train ${liveTrain.VonatSzam}:`, error);
              }
            }
          }
          
          if (results.length > 0) {
            console.log(`✅ Found ${results.length} live trains matching "${params.q}"`);
            return results;
          }
        } catch (error) {
          console.warn('Failed to search live trains, falling back to station search:', error);
        }
      }
      
      // If fromStationId is provided, get departures from that station
      if (params.fromStationId) {
        const searchDate = params.date ? new Date(params.date) : new Date();
        const departures = await this.getDepartures(params.fromStationId, searchDate);
        
        for (const departure of departures) {
          let shouldInclude = true;
          
          // Filter by train number/query if provided
          if (params.q) {
            const query = params.q.toLowerCase();
            shouldInclude = departure.VonatSzam.toLowerCase().includes(query) ||
                          departure.Celallomas.toLowerCase().includes(query);
          }
          
          if (shouldInclude) {
            const result: { train: typeof departure; fromStation: string; details?: any } = {
              train: departure,
              fromStation: params.fromStationId
            };
            
            // If toStationId is specified, fetch train details to check route
            if (params.toStationId) {
              try {
                // Try to construct gtfsId from train number and date
                const gtfsId = this.constructGtfsId(departure.VonatSzam, searchDate);
                if (gtfsId) {
                  const trainDetails = await this.getTrainDetails(gtfsId);
                  if (trainDetails && this.routeIncludesStation(trainDetails, params.toStationId)) {
                    result.details = trainDetails;
                    results.push(result);
                  }
                }
              } catch (error) {
                console.warn(`Failed to get details for train ${departure.VonatSzam}:`, error);
                // Include without route verification if details fetch fails
                results.push(result);
              }
            } else {
              results.push(result);
            }
          }
        }
      }
      
      // If only a query is provided (no stations), try to search by train number
      if (params.q && !params.fromStationId) {
        const searchDate = params.date ? new Date(params.date) : new Date();
        const gtfsId = this.constructGtfsId(params.q, searchDate);
        
        if (gtfsId) {
          try {
            const trainDetails = await this.getTrainDetails(gtfsId);
            if (trainDetails) {
              // Create a synthetic departure entry for search results
              const syntheticDeparture: MavDeparture = {
                VonatSzam: params.q,
                Indulas: new Date().toLocaleTimeString(),
                Celallomas: trainDetails.destination,
                Keses: trainDetails.overallDelay,
                Tipus: 'REG' // Default type, could be improved
              };
              
              results.push({
                train: syntheticDeparture,
                fromStation: 'search',
                details: trainDetails
              });
            }
          } catch (error) {
            console.warn(`Failed to search for train ${params.q}:`, error);
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error searching trains:', error);
      throw error;
    }
  }

  // Helper method to construct gtfsId from train number and date
  private constructGtfsId(trainNumber: string, date: Date): string | null {
    // This is a simplified approach - the actual gtfsId format may be more complex
    // Format: trainNumber_date_direction (e.g., "406_20241223_1")
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    return `${trainNumber}_${dateStr}_1`;
  }

  // Helper method to check if a route includes a specific station
  private routeIncludesStation(trainDetails: TrainDetails, stationId: string): boolean {
    // Check if any stop name matches the station
    // This is simplified - in practice, you'd need station name to ID mapping
    return trainDetails.stops.some(stop => 
      stop.name.toLowerCase().includes(stationId.toLowerCase())
    );
  }

  // Get real-time train positions using EMMA API (exact approach from holavonat-app)
  /**
   * Live positions from vonatinfo.mav.hu.
   *
   * Returns every running train in one ~9 KB response with @Delay already
   * included, so there is no per-train delay lookup and no bbox paging.
   * Fields are @-prefixed because the payload is XML converted to JSON.
   */
  private async getTrainPositionsFromVonatinfo(): Promise<MavTrain[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(MAV_VONATINFO_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': 'https://vonatinfo.mav.hu/',
          'User-Agent': MAV_USER_AGENT,
        },
        body: JSON.stringify({ a: 'TRAINS', jo: { history: false, id: '' } }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`vonatinfo HTTP ${response.status}`);
      }

      // The endpoint is an ASP.NET web service: the body is wrapped in `d`.
      const payload = (await response.json()) as any;
      const result = payload?.d?.result;
      const raw = result?.Trains?.Train;
      const list: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

      if (list.length === 0) {
        console.warn('vonatinfo returned no trains');
        return [];
      }

      // @CreationTime is Hungarian wall clock ("2026.09.16 19:06:38") with no
      // zone, so new Date() on it resolves against the SERVER's timezone. On a
      // UTC host that lands two hours in the future, which made lastUpdate a
      // future timestamp, elapsed time negative (so speed was never derived)
      // and data-age reporting meaningless. The feed is fetched live, so the
      // fetch instant is both accurate and unambiguous.
      const creationTime: string = new Date().toISOString();

      const trains = list.map((t): MavTrain => {
        const relation: string = t['@Relation'] || '';
        // "Wien Westbf - Chop" -> origin / destination
        const [origin, destination] = relation.split(' - ').map((x: string) => x?.trim());
        const number = String(t['@TrainNumber'] ?? '').trim();
        // The worker keys the Redis hash on gtfsId and drops anything without
        // one, so every train needs a stable id. ElviraID is normally unique per
        // run, but ~29 of 334 trains carry a malformed one - HÉV services look
        // like "1574713#905_260916" (fine, still unique) and some arrive as bare
        // "_260916" with an empty prefix, which would make every such train
        // collide on a single hash key. Only accept an id with a real prefix.
        const rawElvira = t['@ElviraID'] ? String(t['@ElviraID']).trim() : '';
        const elvira = /^[^_]+_/.test(rawElvira) ? rawElvira : '';

        return {
          VonatSzam: number,
          Tipus: t['@Menetvonal'] || 'MAV',
          Celallomas: destination || relation || '',
          Kiindulas: origin || undefined,
          UtolsoGPS: {
            Lat: Number(t['@Lat']),
            Lng: Number(t['@Lon']),
            Ido: creationTime,
            Sebesseg: 0,
            Irany: 0,
          },
          Keses: Number(t['@Delay']) || 0,
          gtfsId: elvira || (number ? `vonatinfo:${number}` : undefined),
          trainName: relation || undefined,
          vehicleId: elvira || undefined,
        };
      }).filter(t => Number.isFinite(t.UtolsoGPS!.Lat) && Number.isFinite(t.UtolsoGPS!.Lng));

      console.log(`\u2705 vonatinfo: ${trains.length} live trains (1 request, delays included)`);
      return trains;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Full route for one train from vonatinfo.mav.hu.
   *
   * The OTP backend is IP-blocked for this server, so trip details came back
   * empty and the slide-in showed no timetable at all. vonatinfo returns the
   * same information as a rendered HTML table plus an encoded polyline, keyed
   * by ElviraID (which is what we now store as gtfsId).
   *
   * Row shape:
   *   <tr class="row_past_even">      <- row_past_* means already passed
   *     <td>7</td>                                   km
   *     <td><a onclick="...i: '392', a: 'Rácalmás'">Rácalmás</a></td>
   *     <td>18:39<br><span style="color:red">18:38</span></td>   scheduled / actual arrival
   *     <td>18:39<br><span style="color:green">18:39</span></td> scheduled / actual departure
   *     <td>3</td>                                   platform
   */
  async getRouteDetailsFromVonatinfo(elviraId: string): Promise<{ geometry: string; stops: TrainStop[] } | null> {
    // A malformed id makes vonatinfo hang rather than answer, so do not ask.
    if (!elviraId || !/^[^_]+_\d+$/.test(elviraId)) {
      console.warn(`Skipping vonatinfo route lookup for unusable id "${elviraId}"`);
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(MAV_VONATINFO_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': 'https://vonatinfo.mav.hu/',
          'User-Agent': MAV_USER_AGENT,
        },
        body: JSON.stringify({ a: 'TRAIN', jo: { v: elviraId } }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`vonatinfo TRAIN HTTP ${response.status}`);

      const payload = (await response.json()) as any;
      const result = payload?.d?.result;
      const rawHtml: string = result?.html || '';
      if (!rawHtml) return null;

      // Geometry: first polyline in `line`.
      let geometry = '';
      const line = result?.line;
      if (Array.isArray(line) && line.length > 0 && typeof line[0]?.points === 'string') {
        geometry = line[0].points;
      }

      // Service date from the header, e.g. "(Dunaújváros - Budapest-Kelenföld, 2026.09.16.)".
      // All times in this payload are Budapest wall clock with no zone. They
      // MUST be built via the Budapest helpers: new Date(y, m, d) + setHours()
      // uses the server's zone, and on this UTC host every timetable time
      // came out two hours late.
      const dateMatch = rawHtml.match(/(\d{4})\.(\d{2})\.(\d{2})\./);
      const serviceDate: CalendarDate = dateMatch
        ? { year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]) }
        : budapestToday();
      const sequence = createRouteSequencer(serviceDate);

      const stripTags = (x: string) => x.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').trim();
      const decode = (x: string) =>
        x.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

      /** "18:39<br><span ...>18:38</span>" -> [scheduled, actual] */
      const splitTimes = (cell: string): [string | undefined, string | undefined] => {
        const times = (stripTags(cell).match(/\d{1,2}:\d{2}/g) || []);
        return [times[0], times[1] ?? times[0]];
      };

      const stops: TrainStop[] = [];
      const rowRe = /<tr[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g;
      let row: RegExpExecArray | null;
      while ((row = rowRe.exec(rawHtml)) !== null) {
        const rowClass = row[1] || '';
        const cells = [...row[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
        if (cells.length < 5) continue;                      // header / title rows
        const name = decode(stripTags(cells[1]));
        if (!name) continue;
        const idMatch = cells[1].match(/i:\s*'([^']+)'/);

        const [schedArr, actArr] = splitTimes(cells[2]);
        const [schedDep, actDep] = splitTimes(cells[3]);
        const schedArrival = sequence.scheduled(schedArr);
        const schedDeparture = sequence.scheduled(schedDep);
        const scheduledArrival = schedArrival?.date;
        const actualArrival = sequence.actual(actArr, schedArrival);
        const scheduledDeparture = schedDeparture?.date;
        const actualDeparture = sequence.actual(actDep, schedDeparture);

        const minutesBetween = (a?: Date, b?: Date) =>
          a && b ? Math.round((b.getTime() - a.getTime()) / 60000) : 0;

        stops.push({
          id: idMatch ? idMatch[1] : undefined,
          name,
          scheduledArrival,
          actualArrival,
          scheduledDeparture,
          actualDeparture,
          platform: decode(stripTags(cells[4])) || '',
          arrivalDelay: minutesBetween(scheduledArrival, actualArrival),
          departureDelay: minutesBetween(scheduledDeparture, actualDeparture),
          isPassed: /row_past/.test(rowClass),
        });
      }

      if (stops.length === 0) return null;
      console.log(`\u2705 vonatinfo route: ${stops.length} stops for ${elviraId}`);
      return { geometry, stops };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One station's board for one day - arrivals and departures - from vonatinfo.
   *
   * Looked up by station NAME. vonatinfo's own station ids are not published
   * anywhere, and a name alone returns the identical board (verified against
   * id+name and against the GTFS id). The GTFS station list supplies names.
   *
   * Row shape:
   *   <tr onclick="...map.getData('TRAIN', { v: '8943452_260920', ... })">
   *     <td>00:14<br><span style="color:red">00:13</span></td>  arrival   scheduled / actual
   *     <td>04:08<br><span ...>04:09</span></td>                departure scheduled / actual (blank: terminates here)
   *     <td style="color:blue">3</td>                             platform
   *     <td><a ...>4238</a> személy <br>22:50 Budapest-Déli -- Pécs 06:14</td>
   *         train number and type, then "[origin time, origin] -- [destination, destination time]"
   *
   * Every row carries the train's ElviraID, the same id the live positions feed
   * uses as gtfsId, so a board row can be linked to its train.
   */
  async getStationBoardFromVonatinfo(
    stationName: string,
    date: Date = new Date()
  ): Promise<{ departures: MavDeparture[]; arrivals: MavArrival[] }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let rawHtml = '';
    try {
      const response = await fetch(MAV_VONATINFO_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': 'https://vonatinfo.mav.hu/',
          'User-Agent': MAV_USER_AGENT,
        },
        body: JSON.stringify({ a: 'STATION', jo: { a: stationName, d: vonatinfoDateParam(date), language: '1' } }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`vonatinfo STATION HTTP ${response.status}`);
      const payload = (await response.json()) as any;
      const result = payload?.d?.result;
      rawHtml = typeof result === 'string' ? result : result?.html || '';
    } finally {
      clearTimeout(timer);
    }

    const departures: MavDeparture[] = [];
    const arrivals: MavArrival[] = [];
    if (!rawHtml) return { departures, arrivals };

    // Board date from the title ("Dunaújváros ... 2026.09.21."). Times are
    // Budapest wall clock; see wallClock.ts for why they are never built with
    // new Date(y, m, d).
    const dateMatch = rawHtml.match(/(\d{4})\.(\d{2})\.(\d{2})\./);
    const boardDate: CalendarDate = dateMatch
      ? { year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]) }
      : budapestToday(date);

    const text = (x: string) =>
      x
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|\u00a0/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    const clocks = (cell: string) => text(cell).match(/\d{1,2}:\d{2}/g) || [];
    const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);

    const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/g;
    let row: RegExpExecArray | null;
    while ((row = rowRe.exec(rawHtml)) !== null) {
      const cells = [...row[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
      if (cells.length < 4) continue; // title and header rows use <th>

      const elviraMatch = (row[1] + cells[3]).match(/v:\s*'([^']+)'/);
      const elviraId = elviraMatch ? elviraMatch[1] : undefined;

      const [trainPart, relationPart = ''] = cells[3].split(/<br\s*\/?>/i);
      const numberMatch = trainPart.match(/<a[^>]*>([^<]+)<\/a>/);
      const trainNumber = text(numberMatch ? numberMatch[1] : trainPart).split(' ')[0] || '';
      const trainType = text(numberMatch ? trainPart.replace(numberMatch[0], '') : '') || 'MAV';
      if (!trainNumber) continue;

      // "[HH:MM Origin] -- [Destination HH:MM]"
      const [left = '', right = ''] = text(relationPart).split('--').map(part => part.trim());
      const origin = left.replace(/^\d{1,2}:\d{2}\s*/, '').trim();
      const destination = right.replace(/\s*\d{1,2}:\d{2}$/, '').trim();
      const platform = text(cells[2]) || undefined;

      const [arrSchedTxt, arrActTxt] = clocks(cells[0]);
      const [depSchedTxt, depActTxt] = clocks(cells[1]);
      const arrHm = parseClock(arrSchedTxt);
      const depHm = parseClock(depSchedTxt);

      const scheduledArrival = arrHm ? atDay(boardDate, 0, arrHm) : undefined;
      // A through train that arrives before midnight and leaves after it.
      let depDayOffset = 0;
      let scheduledDeparture = depHm ? atDay(boardDate, 0, depHm) : undefined;
      if (scheduledArrival && scheduledDeparture && scheduledDeparture < scheduledArrival) {
        depDayOffset = 1;
        scheduledDeparture = atDay(boardDate, 1, depHm!);
      }

      if (scheduledArrival) {
        const actHm = parseClock(arrActTxt);
        const actual = actHm ? nearestTo(boardDate, 0, actHm, scheduledArrival) : undefined;
        arrivals.push({
          VonatSzam: trainNumber,
          Erkezes: scheduledArrival.toISOString(),
          Kiindulas: origin,
          Vagany: platform,
          Keses: actual ? Math.max(0, minutesBetween(scheduledArrival, actual)) : 0,
          Tipus: trainType,
          elviraId,
          actualTime: actual?.toISOString(),
        });
      }
      if (scheduledDeparture) {
        const actHm = parseClock(depActTxt);
        const actual = actHm ? nearestTo(boardDate, depDayOffset, actHm, scheduledDeparture) : undefined;
        departures.push({
          VonatSzam: trainNumber,
          Indulas: scheduledDeparture.toISOString(),
          Celallomas: destination,
          Vagany: platform,
          Keses: actual ? Math.max(0, minutesBetween(scheduledDeparture, actual)) : 0,
          Tipus: trainType,
          elviraId,
          actualTime: actual?.toISOString(),
        });
      }
    }

    departures.sort((a, b) => a.Indulas.localeCompare(b.Indulas));
    arrivals.sort((a, b) => a.Erkezes.localeCompare(b.Erkezes));
    return { departures, arrivals };
  }

  async getTrainPositions(bounds?: {north: number, south: number, east: number, west: number}): Promise<MavTrain[]> {
    // vonatinfo.mav.hu is the primary source: it is MÁV's own tracker, it is not
    // IP-blocked, and it answers with every train and its delay in one request.
    // The OTP backend stays as a fallback for when vonatinfo is unavailable.
    try {
      const viaVonatinfo = await this.getTrainPositionsFromVonatinfo();
      if (viaVonatinfo.length > 0) return viaVonatinfo;
      console.warn('vonatinfo returned nothing, falling back to the OTP backend');
    } catch (error) {
      console.error('vonatinfo failed, falling back to the OTP backend:', error);
    }

    console.log('🚂 Attempting to fetch real-time train data from MÁV EMMA API...');
    
    try {
      // Use exact bounds from holavonat-app if none provided
      const queryBounds = bounds || {
        north: 48.7,
        south: 45.5,
        east: 22.8,
        west: 16.1
      };
      
      // Basic GraphQL query for vehicle positions (stoptimes need separate calls with serviceDay)
      // Delay comes back inline with the positions. Asking each train for its
      // delay separately meant ~1 request per live train per cycle (~123 of them,
      // fired as a simultaneous burst), which is what tripped MÁV's per-host
      // limit. arrivalDelay/departureDelay are seconds.
      const vehicleQuery = `{ vehiclePositions(swLat: ${queryBounds.south}, swLon: ${queryBounds.west}, neLat: ${queryBounds.north}, neLon: ${queryBounds.east}, modes: [RAIL, RAIL_REPLACEMENT_BUS]) { trip { gtfsId tripShortName tripHeadsign departureStoptime { departureDelay } arrivalStoptime { arrivalDelay } } vehicleId lat lon label speed heading } }`;

      const data = await otpGraphQLRequest<{ vehiclePositions: any[] | null }>(vehicleQuery, 'getTrainPositions');

      const vehicles = data.vehiclePositions || [];
      console.log(`✅ Successfully fetched ${vehicles.length} vehicles from OTP API`);

      if (vehicles.length === 0) {
        // Returning invented trains here is how stale/fake data reached the map
        // before. An empty result makes the worker keep the previous cache and
        // lets /api/health report the data ageing.
        console.error('❌ MAV OTP API returned 0 vehicles - keeping previously cached train data');
        return [];
      }
      
      // Transform to our MavTrain format
      const trains = this.transformHolavonatData(vehicles);
      
      // Delay now arrives with the positions query, so there is no second
      // round of per-train requests. Prefer arrivalDelay (what a passenger
      // waiting down the line experiences); fall back to departureDelay.
      const delayMap = new Map<string, number>();
      for (const vehicle of vehicles) {
        const trip = vehicle?.trip || {};
        const key = trip.tripShortName || vehicle?.vehicleId;
        if (!key) continue;
        const seconds = trip.arrivalStoptime?.arrivalDelay ?? trip.departureStoptime?.departureDelay;
        if (typeof seconds !== 'number') continue;
        delayMap.set(key, Math.max(0, Math.round(seconds / 60)));
      }

      const trainsWithDelays = trains.map(train => ({
        ...train,
        Keses: delayMap.get(train.VonatSzam) ?? train.Keses,
      }));

      console.log(`\u23f1\ufe0f Delays resolved inline for ${delayMap.size}/${trains.length} trains (0 extra requests)`);

      // Log final statistics
      const trainsWithDelay = trainsWithDelays.filter(t => t.Keses > 0);
      console.log(`✅ Fetched ${trainsWithDelays.length} trains with delay information:`);
      console.log(`  🟢 On-time (0-4 min): ${trainsWithDelays.filter(t => t.Keses <= 4).length}`);
      console.log(`  🟡 Minor delay (5-19 min): ${trainsWithDelay.filter(t => t.Keses >= 5 && t.Keses <= 19).length}`);
      console.log(`  🟠 Moderate delay (20-59 min): ${trainsWithDelay.filter(t => t.Keses >= 20 && t.Keses <= 59).length}`);
      console.log(`  🔴 Severe delay (60+ min): ${trainsWithDelay.filter(t => t.Keses >= 60).length}`);
      
      return trainsWithDelays;
    } catch (error) {
      if (error instanceof OtpRateLimitedError) {
        console.error('💥 Train position fetch skipped/failed because MAV OTP is rate limiting us. Serving cached data.');
      } else {
        console.error('💥 Error fetching train positions from MAV OTP API:', error);
      }
      // Never fabricate trains: an empty list means "no fresh data", which the
      // worker and /api/health both handle honestly.
      return [];
    }
  }

  // Transform holavonat-app format vehicle data to our format
  private transformHolavonatData(vehicles: any[]): MavTrain[] {
    console.log('🔄 Transforming holavonat vehicle data...');
    
    return vehicles.map((vehicle, index) => {
      const trip = vehicle.trip || {};
      const trainNumber = trip.tripShortName || vehicle.vehicleId || 'Unknown';
      
      // Debug first few vehicles to check coordinates and vehicleId
      if (index < 5) {
        console.log(`🚂 Raw vehicle ${index}:`, {
          trainNumber,
          rawLat: vehicle.lat,
          rawLng: vehicle.lon,
          trip: trip.tripHeadsign,
          gtfsId: trip.gtfsId,
          trainName: trip.trainName,
          vehicleId: vehicle.vehicleId,
          fullVehicle: vehicle
        });
      }
      
      // Parse UIC code for locomotive/EMU identification.
      // If the vehicle id does not identify a locomotive, leave it undefined - a
      // demo/placeholder locomotive class here used to be shown to users as if it
      // were the real traction on the first three trains of every fetch.
      const uicInfo = vehicle.vehicleId ? parseUIC(vehicle.vehicleId) : undefined;
      
      // Debug UIC parsing for first few vehicles
      if (index < 3 && uicInfo) {
        console.log(`🔍 UIC Parsing for ${trainNumber}:`, {
          vehicleId: vehicle.vehicleId,
          uicType: uicInfo.trainType?.name,
          confidence: uicInfo.confidence,
          category: uicInfo.trainType?.category,
          hasAC: uicInfo.trainType?.hasAirConditioning
        });
      }

      return {
        VonatSzam: trainNumber,
        Tipus: this.inferTrainType(trainNumber),
        Celallomas: trip.tripHeadsign || 'Unknown',
        UtolsoGPS: {
          Lat: vehicle.lat,
          Lng: vehicle.lon,
          Ido: new Date().toISOString(),
          Sebesseg: vehicle.speed || 0,
          Irany: vehicle.heading || 0
        },
        Keses: 0, // Will be updated by batch delay fetch
        gtfsId: trip.gtfsId, // Store for delay lookup
        trainName: trip.trainName, // Route name like S60
        vehicleId: vehicle.vehicleId, // Raw vehicle ID for reference
        uicInfo, // UIC parsing result
        locomotiveType: uicInfo?.trainType // Detected locomotive/EMU type
      };
    });
  }

  // Infer train type from train number (based on MÁV numbering system)
  private inferTrainType(trainNumber: string): string {
    const num = parseInt(trainNumber);
    if (num >= 400 && num <= 499) return 'IC';
    if (num >= 100 && num <= 199) return 'EC';
    if (num >= 1000 && num <= 1999) return 'RJ';
    if (num >= 3000 && num <= 3999) return 'S';
    if (num >= 40000 && num <= 49999) return 'EN';
    return 'REG';
  }

}

export const mavApi = new MavApiClient();