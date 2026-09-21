/**
 * Ranked search over the station list, and the arrivals board that goes with a
 * matched station.
 *
 * The station list is the whole network (~1200 stops), so this is what makes
 * intermediate stops findable: a search for "Balatonföldvár" used to come back
 * empty because no live train starts or ends there, and the ⌘K dialog only ever
 * looked at trains.
 *
 * Matching follows the train matcher in ../trains/search.ts: tokens split on
 * anything non-alphanumeric, EVERY token has to match, and matching ignores
 * case and accents ("balatonfoldvar" finds "Balatonföldvár"). It differs in one
 * way - a long token may match inside a word, so "földvár" still finds
 * "Balatonföldvár". Short tokens never match inside a word, which is the rule
 * that keeps "ic" from matching "Kosice".
 *
 * Pure, no I/O.
 */
import { Station, Departure } from '../../types';
import { foldText } from '../trains/identity';

/** The query is the whole station name. */
const SCORE_EXACT = 100;
/** The name begins with the query: "balatonf" -> "Balatonföldvár". */
const SCORE_NAME_PREFIX = 20;
/** Token equals a whole word of the name. */
const SCORE_WORD = 3;
/** Token starts a word: "kelet" -> "Budapest-Keleti". */
const SCORE_WORD_PREFIX = 2;
/** Token sits inside a word: "foldvar" -> "Balatonföldvár". */
const SCORE_INSIDE_WORD = 1;

/**
 * Shortest token that may match inside a word rather than at its start. Five,
 * because four lets "gyor" match Balatonszentgyörgy while still finding Győr;
 * at five "füred" finds Balatonfüred and "földvár" finds Balatonföldvár.
 */
const MIN_INSIDE_WORD = 5;

/** "Budapest-Keleti" -> ["budapest", "keleti"]. */
const wordsOf = (text: string | undefined) =>
  foldText(text || '').split(/[^a-z0-9]+/).filter(Boolean);

function scoreToken(words: string[], token: string): number | null {
  let best: number | null = null;
  const consider = (score: number) => {
    if (best === null || score > best) best = score;
  };

  for (const word of words) {
    if (word === token) consider(SCORE_WORD);
    else if (word.startsWith(token)) consider(SCORE_WORD_PREFIX);
    else if (token.length >= MIN_INSIDE_WORD && word.includes(token)) consider(SCORE_INSIDE_WORD);
  }

  return best;
}

/**
 * Stations matching `query`, best first. Ties break towards the shorter name,
 * so "balaton" leads with Balatonfüred rather than Balatonszentgyörgy.
 */
export function searchStations(stations: Station[], query: string, limit = 5): Station[] {
  const tokens = wordsOf(query);
  if (tokens.length === 0) return [];

  const foldedQuery = foldText(query);
  const collapsedQuery = tokens.join(' ');

  const hits: { station: Station; score: number }[] = [];

  for (const station of stations) {
    const words = wordsOf(station.name);
    if (words.length === 0) continue;

    let score = 0;
    let all = true;
    for (const token of tokens) {
      const tokenScore = scoreToken(words, token);
      if (tokenScore === null) {
        all = false;
        break;
      }
      score += tokenScore;
    }
    if (!all) continue;

    const foldedName = foldText(station.name);
    if (foldedName === foldedQuery || words.join(' ') === collapsedQuery) {
      score += SCORE_EXACT;
    } else if (foldedName.startsWith(foldedQuery) || words[0].startsWith(tokens[0])) {
      score += SCORE_NAME_PREFIX;
    }

    hits.push({ station, score });
  }

  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.station.name.length - b.station.name.length ||
        a.station.name.localeCompare(b.station.name, 'hu')
    )
    .slice(0, limit)
    .map(hit => hit.station);
}

/** `time` is typed as Date but arrives from the API as an ISO string. */
const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

/**
 * The next arrivals that have not happened yet, earliest first. Delay counts
 * towards whether a train has arrived, so one running 20 minutes late stays on
 * the list for 20 minutes longer.
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
      return scheduled.getTime() + (arrival.delay || 0) * 60_000 >= now.getTime();
    })
    .sort((a, b) => toDate(a.time).getTime() - toDate(b.time).getTime())
    .slice(0, limit);
}
