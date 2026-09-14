// MÁV API integration based on reference implementations
import { TrainDetails, TrainStop } from '../../types';
import { parseUIC } from '../uicParser';

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
}

export interface MavArrival {
  VonatSzam: string;
  Erkezes: string;
  Kiindulas: string;
  Vagany?: string;
  Keses: number;
  Tipus: string;
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
  async getDepartures(stationId: string, date: Date = new Date()): Promise<MavDeparture[]> {
    try {
      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '.');
      
      const response = await fetch(`${MAV_MOBILE_API_BASE}/GetAllomasInfo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': MAV_USER_AGENT,
        },
        body: JSON.stringify({
          UAID: MAV_UAID,
          Nyelv: 'HU',
          AllomasKod: stationId,
          Datum: dateStr
        })
      });

      if (!response.ok) {
        throw new Error(`MÁV API error: ${response.status}`);
      }

      const data = await response.json();
      return (data as any)?.Indulasok || [];
    } catch (error) {
      console.error('Error fetching departures from MÁV:', error);
      throw error;
    }
  }

  // Get train arrivals for a station
  async getArrivals(stationId: string, date: Date = new Date()): Promise<MavArrival[]> {
    try {
      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '.');
      
      const response = await fetch(`${MAV_MOBILE_API_BASE}/GetAllomasInfo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': MAV_USER_AGENT,
        },
        body: JSON.stringify({
          UAID: MAV_UAID,
          Nyelv: 'HU',
          AllomasKod: stationId,
          Datum: dateStr
        })
      });

      if (!response.ok) {
        throw new Error(`MÁV API error: ${response.status}`);
      }

      const data = await response.json();
      return (data as any)?.Erkezesek || [];
    } catch (error) {
      console.error('Error fetching arrivals from MÁV:', error);
      throw error;
    }
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
  async getTrainPositions(bounds?: {north: number, south: number, east: number, west: number}): Promise<MavTrain[]> {
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