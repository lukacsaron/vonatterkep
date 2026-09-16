/**
 * Snap a vehicle's reported GPS position onto its route polyline.
 *
 * MÁV reports raw GPS for each train, routinely tens of metres off the actual
 * rails, so markers float next to the track instead of sitting on it. Projecting
 * the point onto the trip's route geometry fixes that, the way megisholavonat's
 * `project_with_heading` does.
 *
 * Two things keep this honest:
 *
 *  1. Heading disambiguation. A route polyline can cross itself, branch, run
 *     parallel to itself or double back (terminal reversals, loops, twin track).
 *     Pure nearest-point projection picks arbitrarily between those. When the
 *     train reports a heading we prefer the segment whose direction agrees with it.
 *  2. A hard distance ceiling. If the nearest point on the line is further than
 *     MAX_SNAP_DISTANCE_M from the reported GPS, something is wrong (stale
 *     geometry, wrong trip, diverted train) and the raw position is returned
 *     untouched. A confidently wrong position is worse than an honestly offset one.
 *
 * A caveat worth stating, because it limits case 1: MÁV's `RouteDetails.geometry`
 * is *line* geometry (the payload carries `linenum` / `section`), not a
 * trip-directed shape, so it is not guaranteed to run in the train's direction of
 * travel — an observed example is train 554201 (Dunaújváros -> Budapest-Kelenföld)
 * whose polyline runs Kelenföld -> Dunaújváros. Therefore the default comparison
 * is *undirected*: a segment is judged on whether the train's heading lies along
 * its axis, not along its arrow. That still rejects crossings and branches that
 * meet at an angle, which is the common case. Telling apart two exactly
 * anti-parallel legs additionally needs the polyline's orientation, which
 * `resolveRouteDirection()` can derive from the trip's ordered stop coordinates
 * when those are available; pass the result as `routeDirection`.
 *
 * This module is pure: no I/O, no network, no map or DOM access. It works on a
 * polyline the caller already holds, so it costs zero extra upstream requests.
 */

import { decodePolyline } from '@/lib/utils';

/** [longitude, latitude] — GeoJSON / Mapbox order. */
export type LngLat = [number, number];

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * +1  polyline runs in the train's direction of travel
 * -1  polyline runs against it
 *  0  unknown — compare heading undirected (default)
 */
export type RouteDirection = 1 | -1 | 0;

/**
 * Never move a marker further than this. Chosen so ordinary GPS scatter and the
 * offset between the rail centreline and the published route geometry are
 * comfortably covered, while a genuinely mismatched route (diverted train, wrong
 * trip id, stale geometry) is rejected instead of teleporting the marker onto a
 * line the train is not on.
 */
export const MAX_SNAP_DISTANCE_M = 500;

/**
 * Segments whose perpendicular distance is within this much of the best one are
 * treated as equally plausible, and heading decides between them. Below this the
 * difference is noise; above it, geometry is more trustworthy than heading.
 */
export const HEADING_AMBIGUITY_M = 25;

/**
 * Worst-case penalty, in "virtual metres", for a segment whose direction
 * disagrees with the reported heading as badly as possible. Deliberately larger
 * than HEADING_AMBIGUITY_M: inside the ambiguity band a well-aligned segment
 * always beats a badly-aligned one, even when the latter is marginally closer.
 */
export const HEADING_PENALTY_M = 60;

const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

export type SnapReason = 'snapped' | 'no-route' | 'invalid-position' | 'too-far';

export interface SnapOptions {
  /** Degrees clockwise from north. 0, null, undefined and NaN all mean "unknown". */
  heading?: number | null;
  /** Orientation of the polyline relative to travel. Defaults to 0 (unknown). */
  routeDirection?: RouteDirection;
  /** Refuse to snap further than this. Defaults to MAX_SNAP_DISTANCE_M. */
  maxSnapMeters?: number;
}

export interface SnapResult {
  /** Where to draw the marker: the snapped point, or the untouched GPS point. */
  position: LngLat;
  /** True only when `position` was deliberately moved onto the route. */
  snapped: boolean;
  /** Metres from the reported GPS to the nearest point on the route. Infinity if unknown. */
  offsetMeters: number;
  /** Metres along the polyline from its first vertex to the snapped point. Null when not snapped. */
  alongMeters: number | null;
  /** Index i of the chosen segment route[i] -> route[i + 1]. Null when not snapped. */
  segmentIndex: number | null;
  /** Bearing of the chosen segment, degrees clockwise from north. Null when not snapped. */
  segmentBearing: number | null;
  /** True when a usable heading actually decided between two or more candidates. */
  headingUsed: boolean;
  /** How many segments were close enough to the nearest one to count as ambiguous. */
  candidateCount: number;
  reason: SnapReason;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPlausibleLngLat(p: unknown): p is LngLat {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    isFiniteNumber(p[0]) &&
    isFiniteNumber(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
  );
}

/** Fold any angle into [0, 360). */
export function normalizeBearing(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/** Smallest absolute difference between two bearings, in [0, 180]. */
export function bearingDelta(a: number, b: number): number {
  const d = Math.abs(normalizeBearing(a) - normalizeBearing(b));
  return d > 180 ? 360 - d : d;
}

/**
 * A heading is usable only if it is a finite number AND not exactly zero.
 *
 * The app derives heading from consecutive positions and writes `train.heading || 0`
 * throughout, so a literal 0 cannot be told apart from "we don't know". Treating
 * it as unknown costs almost nothing: a genuinely north-bound train falls back to
 * plain nearest-point snapping, which is the safe default anyway.
 */
export function isUsableHeading(heading: number | null | undefined): heading is number {
  if (!isFiniteNumber(heading)) return false;
  return normalizeBearing(heading) !== 0;
}

/**
 * Decode an encoded polyline (standard Google algorithm, precision 5) into
 * [lng, lat] pairs, dropping anything that did not decode to a sane coordinate.
 *
 * The bit-twiddling itself is reused from `@/lib/utils` — the repo already had a
 * decoder for drawing the route line, and two copies would be a good way to end
 * up with two different behaviours. No new dependency.
 */
export function decodeRoutePolyline(encoded: string | null | undefined): LngLat[] {
  if (typeof encoded !== 'string' || encoded.length === 0) return [];
  let decoded: [number, number][];
  try {
    decoded = decodePolyline(encoded);
  } catch {
    return [];
  }
  return decoded.filter(isPlausibleLngLat);
}

/** Great-circle distance in metres. */
function haversineMeters(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const dLat = (bLat - aLat) * DEG;
  const dLng = (bLng - aLng) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

interface Candidate {
  index: number;
  lng: number;
  lat: number;
  distance: number;
  bearing: number;
  /** fraction along the segment, 0..1 */
  t: number;
}

/**
 * Project `position` onto every segment of `route` in a local tangent plane
 * anchored at the position itself. Exact where it matters (right around the GPS
 * fix) and monotonic enough further out that distant segments still lose.
 */
function collectCandidates(rawLng: number, rawLat: number, route: LngLat[]): Candidate[] {
  const mPerDegLat = EARTH_RADIUS_M * DEG;
  const mPerDegLng = mPerDegLat * Math.cos(rawLat * DEG);
  const out: Candidate[] = [];

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    if (!isPlausibleLngLat(a) || !isPlausibleLngLat(b)) continue;

    const ax = (a[0] - rawLng) * mPerDegLng;
    const ay = (a[1] - rawLat) * mPerDegLat;
    const dx = (b[0] - a[0]) * mPerDegLng;
    const dy = (b[1] - a[1]) * mPerDegLat;
    const len2 = dx * dx + dy * dy;

    // Duplicate consecutive vertices carry no direction, and the shared vertex is
    // already covered by the neighbouring real segments.
    if (len2 === 0) continue;

    // Clamped scalar projection of the origin (the GPS point) onto A->B.
    let t = -(ax * dx + ay * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    const px = ax + t * dx;
    const py = ay + t * dy;

    out.push({
      index: i,
      lng: rawLng + px / mPerDegLng,
      lat: rawLat + py / mPerDegLat,
      distance: Math.hypot(px, py),
      bearing: normalizeBearing(Math.atan2(dx, dy) / DEG),
      t,
    });
  }

  return out;
}

/** Distance along the polyline from its first vertex to a point on segment `index`. */
function alongMetersTo(route: LngLat[], index: number, t: number): number {
  let total = 0;
  for (let i = 0; i < index; i++) {
    total += haversineMeters(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1]);
  }
  const a = route[index];
  const b = route[index + 1];
  return total + t * haversineMeters(a[0], a[1], b[0], b[1]);
}

/**
 * How badly a segment's direction disagrees with the reported heading, 0 (perfect)
 * to 1 (worst possible).
 *
 * direction  +1 : compare against the segment's own bearing
 * direction  -1 : compare against the reverse bearing (polyline runs backwards)
 * direction   0 : undirected — a segment parallel OR anti-parallel to the heading
 *                 scores 0, one at right angles scores 1. This is what rejects a
 *                 crossing line without pretending to know which way the polyline runs.
 */
function misalignment(segmentBearing: number, heading: number, direction: RouteDirection): number {
  if (direction === 0) {
    return 1 - Math.abs(Math.cos(bearingDelta(segmentBearing, heading) * DEG));
  }
  const effective = direction === -1 ? segmentBearing + 180 : segmentBearing;
  return (1 - Math.cos(bearingDelta(effective, heading) * DEG)) / 2;
}

/**
 * Project a point onto a polyline, using its heading to break ties.
 *
 * @param position the reported GPS position
 * @param route    the decoded route, [lng, lat] pairs
 * @param options  heading, polyline orientation and the distance ceiling
 */
export function snapToRoute(
  position: GeoPoint | null | undefined,
  route: LngLat[] | null | undefined,
  options: SnapOptions = {}
): SnapResult {
  const { heading, routeDirection = 0, maxSnapMeters = MAX_SNAP_DISTANCE_M } = options;
  const rawLng = position?.longitude;
  const rawLat = position?.latitude;

  if (!isFiniteNumber(rawLng) || !isFiniteNumber(rawLat)) {
    return {
      position: [Number.NaN, Number.NaN],
      snapped: false,
      offsetMeters: Number.POSITIVE_INFINITY,
      alongMeters: null,
      segmentIndex: null,
      segmentBearing: null,
      headingUsed: false,
      candidateCount: 0,
      reason: 'invalid-position',
    };
  }

  const raw: LngLat = [rawLng, rawLat];
  const fail = (reason: SnapReason, offsetMeters: number): SnapResult => ({
    position: raw,
    snapped: false,
    offsetMeters,
    alongMeters: null,
    segmentIndex: null,
    segmentBearing: null,
    headingUsed: false,
    candidateCount: 0,
    reason,
  });

  if (!Array.isArray(route) || route.length < 2) {
    return fail('no-route', Number.POSITIVE_INFINITY);
  }

  const all = collectCandidates(rawLng, rawLat, route);
  if (all.length === 0) return fail('no-route', Number.POSITIVE_INFINITY);

  let nearest = all[0];
  for (const c of all) {
    if (c.distance < nearest.distance) nearest = c;
  }

  // Heading disambiguation. Everything within HEADING_AMBIGUITY_M of the nearest
  // perpendicular distance counts as equally plausible on geometry alone; among
  // those, the segment whose direction best agrees with the heading wins.
  const cutoff = nearest.distance + HEADING_AMBIGUITY_M;
  const candidates = all.filter((c) => c.distance <= cutoff);
  let chosen = nearest;
  let headingUsed = false;

  if (isUsableHeading(heading) && candidates.length > 1) {
    let bestScore = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const score = c.distance + HEADING_PENALTY_M * misalignment(c.bearing, heading, routeDirection);
      if (score < bestScore) {
        bestScore = score;
        chosen = c;
      }
    }
    headingUsed = true;
  }

  if (chosen.distance > maxSnapMeters) {
    return fail('too-far', nearest.distance);
  }

  return {
    position: [chosen.lng, chosen.lat],
    snapped: true,
    offsetMeters: chosen.distance,
    alongMeters: alongMetersTo(route, chosen.index, chosen.t),
    segmentIndex: chosen.index,
    segmentBearing: chosen.bearing,
    headingUsed,
    candidateCount: candidates.length,
    reason: 'snapped',
  };
}

/** Convenience wrapper: decode an encoded polyline, then snap onto it. */
export function snapToEncodedRoute(
  position: GeoPoint | null | undefined,
  encodedGeometry: string | null | undefined,
  options: SnapOptions = {}
): SnapResult {
  return snapToRoute(position, decodeRoutePolyline(encodedGeometry), options);
}

/**
 * Work out whether a polyline runs in the trip's direction of travel, by
 * projecting the trip's stops (in schedule order) onto it and seeing whether the
 * along-line distance mostly grows or mostly shrinks.
 *
 * Returns 0 when it cannot tell — fewer than two usable waypoints, or the two
 * readings disagree. Callers should then leave `routeDirection` at 0 and accept
 * the undirected heading rule.
 *
 * Note that MÁV's vonatinfo timetable path (the one normally serving
 * `RouteDetails.stops`) does not carry stop coordinates, so in practice this often
 * returns 0. It costs nothing to try and no extra request either way.
 */
export function resolveRouteDirection(
  route: LngLat[] | null | undefined,
  orderedWaypoints: Array<GeoPoint | null | undefined>
): RouteDirection {
  if (!Array.isArray(route) || route.length < 2) return 0;

  const alongs: number[] = [];
  for (const wp of orderedWaypoints) {
    if (!wp || !isFiniteNumber(wp.latitude) || !isFiniteNumber(wp.longitude)) continue;
    const snapped = snapToRoute(wp, route, { maxSnapMeters: MAX_SNAP_DISTANCE_M });
    if (snapped.snapped && snapped.alongMeters !== null) alongs.push(snapped.alongMeters);
  }
  if (alongs.length < 2) return 0;

  let forward = 0;
  let backward = 0;
  for (let i = 1; i < alongs.length; i++) {
    const d = alongs[i] - alongs[i - 1];
    if (d > 0) forward++;
    else if (d < 0) backward++;
  }
  if (forward === backward) return 0;
  return forward > backward ? 1 : -1;
}
