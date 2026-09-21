/**
 * Ranked search over live trains.
 *
 * The query is split into tokens and EVERY token has to match something:
 *   - a number                 "142", "3144", "H4004" -> train number, exact or prefix
 *   - a category               "IC", "InterCity", "EC", "railjet", "gyors", "HÉV", ...
 *   - a line                   "S80", "Z72", "H5"
 *   - anything else (>= 3 ch.) -> train name or station name, whole word or word prefix
 * Two-letter text is only ever a category or a whole word - never a substring,
 * which is how "IC" used to match "Kosice" and "Balatonakali-Dörgicse".
 * Matching ignores case and accents ("godollo" finds "Gödöllő").
 *
 * Pure, no I/O: usable from the API route and from the browser.
 */
import { Train, TrainType } from '../../types';
import { foldText } from './identity';

type Matcher = (train: Train) => boolean;

const hasType = (type: TrainType): Matcher => train => train.type === type;
const categoryStarts = (...prefixes: string[]): Matcher => train => {
  const category = foldText(train.category || '');
  return prefixes.some(prefix => category.startsWith(prefix));
};

/** Query word (folded) -> which trains it means. */
const CATEGORY_WORDS: Record<string, { label: string; matches: Matcher }> = {};
function category(words: string[], label: string, matches: Matcher) {
  for (const word of words) CATEGORY_WORDS[word] = { label, matches };
}
category(['ic', 'intercity'], 'InterCity', hasType(TrainType.IC));
category(['ec', 'eurocity'], 'EuroCity', hasType(TrainType.EC));
category(['rj', 'rjx', 'railjet'], 'railjet', hasType(TrainType.RAILJET));
category(['en', 'euronight', 'nightjet', 'ejszakai'], 'EuroNight', hasType(TrainType.NIGHT));
category(['ir', 'interregio'], 'InterRégió', categoryStarts('interregio'));
category(['gyors', 'gyorsvonat'], 'gyorsvonat', categoryStarts('gyorsvonat'));
category(['sebes', 'sebesvonat'], 'sebesvonat', categoryStarts('sebesvonat'));
category(['ex', 'expressz', 'expresszvonat'], 'expresszvonat', categoryStarts('expressz'));
category(['szemely', 'szemelyvonat'], 'személyvonat', categoryStarts('szemely'));
category(['zonazo'], 'zónázó', train => categoryStarts('zonazo')(train) || /^z\d+$/i.test(train.line || ''));
category(['hev'], 'HÉV', train => train.operator === 'HEV');
category(['tramtrain'], 'TramTrain', categoryStarts('tramtrain'));
category(['gysev'], 'GYSEV', train => train.operator === 'GYSEV');
category(['mav'], 'MÁV', train => train.operator === 'MAV');

type Token =
  | { kind: 'number'; value: string }
  | { kind: 'category'; value: string }
  | { kind: 'line'; value: string }
  | { kind: 'text'; value: string };

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  // Hyphens split too: station names are matched word by word ("Budapest-Keleti").
  for (const word of foldText(query).split(/[^a-z0-9]+/).filter(Boolean)) {
    if (/^\d+$/.test(word) || /^h\d{3,}$/.test(word)) {
      tokens.push({ kind: 'number', value: word });
    } else if (/^[szgh]\d{1,2}$/.test(word)) {
      tokens.push({ kind: 'line', value: word });
    } else if (CATEGORY_WORDS[word]) {
      tokens.push({ kind: 'category', value: word });
    } else {
      // "IC560": category glued to a number ("IC 560" and "IC-560" arrive as two words).
      const glued = word.match(/^([a-z]+)(\d+)$/);
      if (glued && CATEGORY_WORDS[glued[1]]) {
        tokens.push({ kind: 'category', value: glued[1] }, { kind: 'number', value: glued[2] });
      } else if (word.length >= 2) {
        tokens.push({ kind: 'text', value: word });
      }
      // Single letters are dropped: they match nothing meaningfully.
    }
  }
  return tokens;
}

/** "Budapest-Keleti" -> ["budapest", "keleti"]; "Mátyásföld, repülőtér" -> ["matyasfold", "repuloter"]. */
const wordsOf = (text: string | undefined) => foldText(text || '').split(/[^a-z0-9]+/).filter(Boolean);

export interface TrainSearchHit<T extends Train = Train> {
  train: T;
  score: number;
  /** Human-readable reasons, best first: ["number 142", "name LISZT FERENC"]. */
  matched: string[];
}

function scoreToken(token: Token, train: Train): { score: number; reason: string } | null {
  switch (token.kind) {
    case 'number': {
      const number = foldText(train.number);
      const digits = number.replace(/^h/, '');
      if (number === token.value || digits === token.value) return { score: 100, reason: `number ${train.number}` };
      // Somebody who learned the old prefixed numbers ("55142").
      if (foldText(train.id) === token.value) return { score: 90, reason: `number ${train.number}` };
      if (token.value.length >= 2 && (number.startsWith(token.value) || digits.startsWith(token.value))) {
        return { score: 60, reason: `number ${train.number}` };
      }
      return null;
    }
    case 'line':
      return foldText(train.line || '') === token.value ? { score: 90, reason: `line ${train.line}` } : null;
    case 'category': {
      const entry = CATEGORY_WORDS[token.value];
      if (entry.matches(train)) return { score: 40, reason: entry.label };
      // Not that category - but the same word can still be a name or station word.
      return scoreText(token.value, train);
    }
    case 'text':
      return scoreText(token.value, train);
  }
}

function scoreText(value: string, train: Train): { score: number; reason: string } | null {
  const prefixOk = value.length >= 3;
  let best: { score: number; reason: string } | null = null;
  const consider = (score: number, reason: string) => {
    if (!best || score > best.score) best = { score, reason };
  };

  // trainName is the name, or the line code when there is no name.
  const name = train.trainName && train.trainName !== train.line ? train.trainName : undefined;
  for (const word of wordsOf(name)) {
    if (word === value) consider(70, `name ${name}`);
    else if (prefixOk && word.startsWith(value)) consider(60, `name ${name}`);
  }
  for (const [end, label, bonus] of [[train.destination, 'to', 2], [train.origin, 'from', 0]] as const) {
    for (const word of wordsOf(end?.name)) {
      if (word === value) consider(50 + bonus, `${label} ${end!.name}`);
      else if (prefixOk && word.startsWith(value)) consider(40 + bonus, `${label} ${end!.name}`);
    }
  }
  for (const stop of train.route || []) {
    for (const word of wordsOf(stop.station?.name)) {
      if (word === value || (prefixOk && word.startsWith(value))) consider(25, `via ${stop.station.name}`);
    }
  }
  if (prefixOk) {
    for (const word of wordsOf(train.category)) {
      if (word.startsWith(value)) consider(35, train.category!);
    }
  }
  return best;
}

/** Long-distance services first when scores tie: their numbers are the short ones. */
function byNumber(a: Train, b: Train): number {
  return a.number.length - b.number.length || a.number.localeCompare(b.number, 'hu', { numeric: true });
}

/**
 * Search `trains` for `query`. Returns hits best first; empty for a query with
 * nothing searchable in it (a single letter, punctuation).
 */
export function searchTrains<T extends Train>(trains: T[], query: string, limit = 20): TrainSearchHit<T>[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const folded = foldText(query).replace(/\s+/g, ' ').trim();

  const hits: TrainSearchHit<T>[] = [];
  for (const train of trains) {
    let score = 0;
    const matched: string[] = [];
    let all = true;
    for (const token of tokens) {
      const hit = scoreToken(token, train);
      if (!hit) {
        all = false;
        break;
      }
      score += hit.score;
      if (!matched.includes(hit.reason)) matched.push(hit.reason);
    }
    if (!all) continue;
    // The whole query is the train's name: "liszt ferenc".
    if (train.trainName && foldText(train.trainName) === folded) score += 30;
    hits.push({ train, score, matched });
  }

  return hits.sort((a, b) => b.score - a.score || byNumber(a.train, b.train)).slice(0, limit);
}

/** Trains worth showing before anyone has typed: long-distance categories and named services. */
export function featuredTrains<T extends Train>(trains: T[], limit = 10): T[] {
  const rank: Partial<Record<TrainType, number>> = {
    [TrainType.RAILJET]: 0,
    [TrainType.EC]: 1,
    [TrainType.NIGHT]: 2,
    [TrainType.IC]: 3,
  };
  return trains
    .filter(train => rank[train.type] !== undefined || (train.trainName && train.trainName !== train.line))
    .sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9) || byNumber(a, b))
    .slice(0, limit);
}
