// Relative imports only: the background worker compiles this file with plain
// tsc, which does not rewrite the "@/" path alias.
import { extractZipEntry } from './zip';
import { parseCsv } from './csv';
import type { Station } from '../../types';

/**
 * Station list from MÁV's official GTFS feed.
 *
 * vonatinfo.mav.hu (the live-data source) exposes no station list and no
 * station coordinates, and the OTP host that had them IP-blocks this server.
 * The GTFS feed has every MÁV/GYSEV stop with coordinates, is refreshed nightly
 * by MÁV (~03:45 Budapest time), and is a single authenticated file download -
 * no per-request rate limit to trip.
 */

export const GTFS_STATIONS_KEY = 'gtfs:stations';
export const GTFS_META_KEY = 'gtfs:meta';

const DEFAULT_GTFS_URL = 'https://www.mavcsoport.hu/gtfs/gtfsMavMenetrend.zip';

/** Refresh a little more often than daily so a single failed run self-heals. */
export const GTFS_REFRESH_AFTER_MS = 20 * 60 * 60 * 1000;

/** Keep the last good list far longer than the refresh interval: a failed
 * download must never empty the station list. */
const GTFS_STATIONS_TTL_SECONDS = 14 * 24 * 60 * 60;

/** A truncated or wrong file would otherwise replace 1,199 stations with a few. */
const MIN_PLAUSIBLE_STATIONS = 100;

const DOWNLOAD_TIMEOUT_MS = 120_000;

export interface GtfsMeta {
  /** When the stored station list was downloaded. */
  fetchedAt: string;
  /** When MÁV's server was last asked whether a newer file exists. */
  checkedAt?: string;
  feedVersion?: string;
  stationCount: number;
  /** Validators from the last download, sent back as a conditional request. */
  lastModified?: string;
  etag?: string;
  /** Set if the server answered a conditional request with a full 200 anyway. */
  conditionalUnsupported?: boolean;
}

export type GtfsRefreshResult =
  | { result: 'updated'; meta: GtfsMeta }
  | { result: 'unchanged'; meta: GtfsMeta; reason: 'not-modified' | 'server-ignored-conditional' };

/** The subset of the redis client this module needs, so it can be tested without Redis. */
export interface GtfsRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export function buildStationsFromStops(stopsCsv: string): Station[] {
  const stations: Station[] = [];
  for (const row of parseCsv(stopsCsv)) {
    const id = row.stop_id?.trim();
    const name = row.stop_name?.trim();
    if (!id || !name) continue;
    const lat = Number(row.stop_lat);
    const lon = Number(row.stop_lon);
    const hasPosition = Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
    stations.push({
      id,
      name,
      // Never 0,0 - see the Station type.
      coordinates: hasPosition ? { latitude: lat, longitude: lon } : undefined,
      platforms: [],
      services: [],
    });
  }
  return stations;
}

type GtfsDownload =
  | { status: 'not-modified' }
  | { status: 'ok'; archive: Buffer; lastModified?: string; etag?: string };

/**
 * Download the feed. With validators from the previous download this is a
 * conditional request: MÁV's server answers 304 with an empty body when the
 * file has not changed (verified), so checking costs almost nothing.
 */
export async function downloadGtfsArchive(validators: { lastModified?: string; etag?: string } = {}): Promise<GtfsDownload> {
  const url = process.env.MAV_GTFS_URL || DEFAULT_GTFS_URL;
  const user = process.env.MAV_GTFS_USER;
  const password = process.env.MAV_GTFS_PASSWORD;
  if (!user || !password) {
    throw new Error('MAV_GTFS_USER / MAV_GTFS_PASSWORD are not set');
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
  };
  if (validators.lastModified) headers['If-Modified-Since'] = validators.lastModified;
  if (validators.etag) headers['If-None-Match'] = validators.etag;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (response.status === 304) return { status: 'not-modified' };
    if (!response.ok) throw new Error(`GTFS download failed: HTTP ${response.status}`);
    return {
      status: 'ok',
      archive: Buffer.from(await response.arrayBuffer()),
      lastModified: response.headers.get('last-modified') ?? undefined,
      etag: response.headers.get('etag') ?? undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readMeta(redis: GtfsRedis): Promise<GtfsMeta | null> {
  try {
    const raw = await redis.get(GTFS_META_KEY);
    return raw ? (JSON.parse(raw) as GtfsMeta) : null;
  } catch {
    return null;
  }
}

/**
 * Nothing new upstream: record the check and extend the stored list's TTL.
 * The TTL is otherwise only renewed on a download, so without this a long run
 * of 304s would let a perfectly current station list expire.
 */
async function markChecked(redis: GtfsRedis, meta: GtfsMeta): Promise<GtfsMeta> {
  const updated: GtfsMeta = { ...meta, checkedAt: new Date().toISOString() };
  await redis.expire(GTFS_STATIONS_KEY, GTFS_STATIONS_TTL_SECONDS);
  await redis.set(GTFS_META_KEY, JSON.stringify(updated), { EX: GTFS_STATIONS_TTL_SECONDS });
  return updated;
}

/** Ask for a newer feed; if there is one, extract stops.txt and store the station list. */
export async function refreshGtfsStations(redis: GtfsRedis): Promise<GtfsRefreshResult> {
  const previous = await readMeta(redis);
  const useConditional = previous && !previous.conditionalUnsupported;
  const download = await downloadGtfsArchive(
    useConditional ? { lastModified: previous.lastModified, etag: previous.etag } : {}
  );

  if (download.status === 'not-modified' && previous) {
    return { result: 'unchanged', reason: 'not-modified', meta: await markChecked(redis, previous) };
  }
  if (download.status === 'not-modified') {
    // A 304 without stored validators should be impossible; do not trust it.
    throw new Error('GTFS server answered 304 to an unconditional request');
  }

  // A full response carrying the same Last-Modified we already have means the
  // server ignored the conditional request. Do not reparse; and stop relying on
  // conditional requests, or every hourly check would be a 5.6 MB download.
  if (
    useConditional &&
    previous.lastModified &&
    download.lastModified === previous.lastModified
  ) {
    return {
      result: 'unchanged',
      reason: 'server-ignored-conditional',
      meta: await markChecked(redis, { ...previous, conditionalUnsupported: true }),
    };
  }

  const stations = buildStationsFromStops(extractZipEntry(download.archive, 'stops.txt').toString('utf8'));
  if (stations.length < MIN_PLAUSIBLE_STATIONS) {
    throw new Error(
      `GTFS stops.txt yielded only ${stations.length} stations - refusing to replace the station list`
    );
  }

  let feedVersion: string | undefined;
  try {
    feedVersion = parseCsv(extractZipEntry(download.archive, 'feed_info.txt').toString('utf8'))[0]?.feed_version;
  } catch {
    // feed_info.txt is optional in GTFS.
  }

  const now = new Date().toISOString();
  const meta: GtfsMeta = {
    fetchedAt: now,
    checkedAt: now,
    feedVersion,
    stationCount: stations.length,
    lastModified: download.lastModified,
    etag: download.etag,
    // No validators in the response means conditional requests cannot work;
    // without this flag every hourly check would become a full download.
    conditionalUnsupported:
      (previous?.conditionalUnsupported ?? false) || (!download.lastModified && !download.etag),
  };
  await redis.set(GTFS_STATIONS_KEY, JSON.stringify(stations), { EX: GTFS_STATIONS_TTL_SECONDS });
  await redis.set(GTFS_META_KEY, JSON.stringify(meta), { EX: GTFS_STATIONS_TTL_SECONDS });
  memo = null;
  return { result: 'updated', meta };
}

/**
 * Whether to contact MÁV on this check. With a working conditional request a
 * check is nearly free, so every scheduled check goes out and a new file is
 * picked up within one check interval of being published. Without one (no
 * validators stored, or the server ignored them) fall back to one full
 * download per ~20h.
 */
export async function isGtfsRefreshDue(redis: GtfsRedis, now: number = Date.now()): Promise<boolean> {
  const meta = await readMeta(redis);
  if (!meta) return true;
  if ((meta.lastModified || meta.etag) && !meta.conditionalUnsupported) return true;
  if (!meta.lastModified && !meta.etag && !meta.conditionalUnsupported) {
    // Stored by the version before conditional requests: one download to learn
    // the validators, after which checks become conditional.
    return true;
  }
  const fetchedAt = Date.parse(meta.fetchedAt);
  return !Number.isFinite(fetchedAt) || now - fetchedAt > GTFS_REFRESH_AFTER_MS;
}

// ---------------------------------------------------------------------------
// Read side: in-process memo so a page view costs no Redis round trip once warm.
// ---------------------------------------------------------------------------

const MEMO_TTL_MS = 10 * 60 * 1000;
let memo: { stations: Station[]; byName: Map<string, Station>; byId: Map<string, Station>; expiresAt: number } | null =
  null;

export function normaliseStationName(name: string): string {
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim();
}

function buildIndex(stations: Station[]) {
  const byName = new Map<string, Station>();
  const byId = new Map<string, Station>();
  for (const station of stations) {
    byName.set(normaliseStationName(station.name), station);
    byId.set(station.id, station);
  }
  return { byName, byId };
}

export async function loadGtfsStations(redis: GtfsRedis): Promise<Station[] | null> {
  const index = await loadGtfsIndex(redis);
  return index ? index.stations : null;
}

export async function loadGtfsIndex(
  redis: GtfsRedis
): Promise<{ stations: Station[]; byName: Map<string, Station>; byId: Map<string, Station> } | null> {
  if (memo && memo.expiresAt > Date.now()) return memo;
  try {
    const raw = await redis.get(GTFS_STATIONS_KEY);
    if (!raw) return null;
    const stations = JSON.parse(raw) as Station[];
    if (!Array.isArray(stations) || stations.length === 0) return null;
    memo = { stations, ...buildIndex(stations), expiresAt: Date.now() + MEMO_TTL_MS };
    return memo;
  } catch (error) {
    console.error('Failed to read GTFS station list:', error);
    return null;
  }
}

/**
 * Find a GTFS station by name. vonatinfo sometimes combines names, e.g.
 * "Győr vá. / Győr" or "Csorna / Csorna vá.", so each "/"-separated part is
 * tried as well.
 */
export function findStationByName(byName: Map<string, Station>, name: string | undefined): Station | undefined {
  if (!name) return undefined;
  const direct = byName.get(normaliseStationName(name));
  if (direct) return direct;
  for (const part of name.split('/')) {
    const hit = byName.get(normaliseStationName(part));
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Give route stops coordinates and a station-page id. vonatinfo's trip
 * timetable names each stop but carries no position, which left the map unable
 * to tell which way a polyline runs; names match GTFS 1:1 (no duplicate names
 * in the feed).
 */
export function attachStationData<T extends { name: string; id?: string; coordinates?: { latitude: number; longitude: number } }>(
  stops: T[],
  byName: Map<string, Station>
): { stops: T[]; matched: number } {
  let matched = 0;
  const enriched = stops.map(stop => {
    const station = findStationByName(byName, stop.name);
    if (!station) {
      // Foreign stops (Wien Hbf, ...) are not in MÁV's GTFS. Drop vonatinfo's
      // own station id rather than leave it in a field that otherwise holds
      // GTFS ids - a link built from it would point at the wrong station.
      return { ...stop, id: undefined };
    }
    matched += 1;
    return { ...stop, id: station.id, coordinates: stop.coordinates ?? station.coordinates };
  });
  return { stops: enriched, matched };
}
