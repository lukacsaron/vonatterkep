import { Station, Train, Departure } from '@/types';

/** Exact name match. */
const SCORE_EXACT = 100;
/** Name begins with the query. */
const SCORE_PREFIX = 80;
/** Query starts a word inside the name ("Déli" in "Budapest-Déli"). */
const SCORE_WORD = 70;
/** Query appears somewhere inside the name. */
const SCORE_SUBSTRING = 60;

/**
 * Lowercase and strip diacritics so "balatonfoldvar" finds "Balatonföldvár".
 * Hungarian ő/ű decompose to a base letter plus a combining mark under NFD,
 * so the combining-mark range covers them too.
 */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Score a name against an already-normalized query, or null if it doesn't match. */
function scoreNormalized(name: string, query: string): number | null {
  const haystack = normalize(name);

  if (haystack === query) return SCORE_EXACT;
  if (haystack.startsWith(query)) return SCORE_PREFIX;

  const index = haystack.indexOf(query);
  if (index === -1) return null;

  const precedingChar = haystack[index - 1];
  return /[\s\-–.,()/]/.test(precedingChar) ? SCORE_WORD : SCORE_SUBSTRING;
}

/** Score a single name against a raw query. */
export function scoreName(name: string, query: string): number | null {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;
  return scoreNormalized(name, normalizedQuery);
}

/**
 * Stations matching the query, best first. Ties break towards the shorter
 * name, so "balaton" leads with Balatonfüred rather than Balatonszentgyörgy.
 */
export function matchStations(
  stations: Station[],
  query: string,
  limit = 5
): Station[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  return stations
    .map(station => ({ station, score: scoreNormalized(station.name, normalizedQuery) }))
    .filter((entry): entry is { station: Station; score: number } => entry.score !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.station.name.length !== b.station.name.length) {
        return a.station.name.length - b.station.name.length;
      }
      return a.station.name.localeCompare(b.station.name, 'hu');
    })
    .slice(0, limit)
    .map(entry => entry.station);
}

export interface TrainMatch {
  score: number;
  /** Why this train matched, shown under its name in the results. */
  label: string;
}

/**
 * Best match for a train across its number, name, origin and destination,
 * or null if the query matches none of them.
 */
export function matchTrain(train: Train, query: string): TrainMatch | null {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  const candidates: TrainMatch[] = [];

  const numberScore = scoreNormalized(train.number, normalizedQuery);
  if (numberScore !== null) {
    candidates.push({ score: numberScore, label: `${train.number} vonat` });
  }

  if (train.trainName) {
    const nameScore = scoreNormalized(train.trainName, normalizedQuery);
    if (nameScore !== null) {
      candidates.push({
        score: nameScore - 5,
        label: `${train.trainName} (${train.number})`,
      });
    }
  }

  const origin = train.origin?.name;
  const destination = train.destination?.name;

  if (origin) {
    const originScore = scoreNormalized(origin, normalizedQuery);
    if (originScore !== null) {
      candidates.push({
        score: originScore - 30,
        label: destination ? `${origin} → ${destination}` : `${origin} felől`,
      });
    }
  }

  if (destination) {
    const destinationScore = scoreNormalized(destination, normalizedQuery);
    if (destinationScore !== null) {
      candidates.push({
        score: destinationScore - 30,
        label: origin ? `${origin} → ${destination}` : `${destination} felé`,
      });
    }
  }

  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => (current.score > best.score ? current : best));
}

/** `time` is typed as Date but crosses the API as an ISO string. */
function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * The next arrivals that haven't happened yet, earliest first. A train's
 * delay counts towards whether it has arrived, so one running 20 minutes
 * late still shows up for 20 more minutes.
 */
export function upcomingArrivals(
  arrivals: Departure[],
  now: Date = new Date(),
  limit = 5
): Departure[] {
  return arrivals
    .filter(arrival => {
      const scheduled = toDate(arrival.time);
      if (Number.isNaN(scheduled.getTime())) return false;
      const actual = scheduled.getTime() + (arrival.delay || 0) * 60_000;
      return actual >= now.getTime();
    })
    .sort((a, b) => toDate(a.time).getTime() - toDate(b.time).getTime())
    .slice(0, limit);
}
