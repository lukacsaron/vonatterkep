import type { Departure, RouteDetails, Station, Train, TrainSearchResult } from '@/types';
import type { TrainDataFreshness } from '@/lib/trainFreshness';

/**
 * The single place that knows what our own API looks like.
 *
 * Every endpoint is declared exactly once: its method, how its path is built
 * from its parameters, and what it answers with. Callers hand an `Endpoint` to
 * `api.get()` and get the right type back - they never spell a URL themselves.
 *
 * The bug this exists to prevent: endpoints used to be free-form strings and
 * the response type was whatever the caller asserted, so a path could drift
 * from the route that serves it (or from the API base) and neither the
 * compiler nor a test would notice. Production once sent every request to a
 * page route and returned 404 HTML that was then parsed as JSON.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface Endpoint<TResponse> {
  readonly method: HttpMethod;
  /** Path relative to the API base, always starting with a slash. */
  readonly path: string;
  /**
   * Phantom marker. Never present at runtime - it only exists so TypeScript can
   * infer the response type from the endpoint itself.
   */
  readonly __response?: TResponse;
}

export type GetEndpoint<TResponse> = Endpoint<TResponse> & { readonly method: 'GET' };

/** The type a given endpoint answers with. */
export type ResponseOf<TEndpoint> = TEndpoint extends Endpoint<infer TResponse> ? TResponse : never;

function getEndpoint<TResponse>(path: string): GetEndpoint<TResponse> {
  return { method: 'GET', path };
}

/**
 * MAV ids are not URL safe. Station ids look like "1:005510017" and HEV train
 * gtfsIds like "1574713#905_260916" - interpolated raw, that "#" turns the rest
 * of the id into a URL fragment and the request quietly lands on a different
 * route. Every path parameter goes through here.
 */
function segment(value: string): string {
  return encodeURIComponent(value);
}

/** Response of GET /api/health. Mirrors src/app/api/health/route.ts. */
export interface HealthPayload {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: { app: string; redis: string };
  data?: { trains: TrainDataFreshness };
  uptime?: number;
  memory?: { used: number; total: number };
  /** Only present on the unhandled-error path. */
  error?: string;
}

/** Query accepted by GET /api/trains/search. */
export interface TrainSearchQuery {
  /** General search query for train number or name. */
  q?: string;
  /** UIC code of the origin station. */
  fromStationId?: string;
  /** UIC code of the destination station. */
  toStationId?: string;
  /** The date to search for; defaults to today upstream. */
  date?: Date;
}

/** Query accepted by GET /api/stations/{stationId}/timetable. */
export interface TimetableQuery {
  type: 'departures' | 'arrivals';
  date?: Date;
}

export const endpoints = {
  trains: {
    /** GET /api/trains - every live train. */
    list: (): GetEndpoint<Train[]> => getEndpoint('/trains'),

    /** GET /api/trains/{gtfsId} - one train, enriched with trip details. */
    byId: (gtfsId: string): GetEndpoint<Train> => getEndpoint(`/trains/${segment(gtfsId)}`),

    /** GET /api/trains/{gtfsId}/route-details - polyline plus stops. */
    routeDetails: (gtfsId: string): GetEndpoint<RouteDetails> =>
      getEndpoint(`/trains/${segment(gtfsId)}/route-details`),

    /** GET /api/trains/search?q=... - search the live train cache. */
    search: (query: TrainSearchQuery): GetEndpoint<TrainSearchResult[]> => {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.fromStationId) params.set('fromStationId', query.fromStationId);
      if (query.toStationId) params.set('toStationId', query.toStationId);
      if (query.date) params.set('date', query.date.toISOString().split('T')[0]); // YYYY-MM-DD
      return getEndpoint(`/trains/search?${params.toString()}`);
    },

    /** GET /api/trains/search?featured=true - the same route's curated list. */
    featured: (): GetEndpoint<TrainSearchResult[]> => getEndpoint('/trains/search?featured=true'),
  },

  stations: {
    /** GET /api/stations - the whole network, or the ones matching `search`. */
    list: (search?: string): GetEndpoint<Station[]> =>
      getEndpoint(search ? `/stations?search=${encodeURIComponent(search)}` : '/stations'),

    /** GET /api/stations/{stationId}/timetable?type=departures|arrivals */
    timetable: (stationId: string, query: TimetableQuery): GetEndpoint<Departure[]> => {
      const params = new URLSearchParams({
        type: query.type,
        ...(query.date && { date: query.date.toISOString() }),
      });
      return getEndpoint(`/stations/${segment(stationId)}/timetable?${params.toString()}`);
    },
  },

  /** GET /api/health - app, Redis and live-data freshness. */
  health: (): GetEndpoint<HealthPayload> => getEndpoint('/health'),
} as const;
