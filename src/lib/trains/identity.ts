/**
 * Who a train is: its public number, name, category and line.
 *
 * vonatinfo's positions feed (TRAINS) only gives an operator-prefixed number and
 * a relation. The category, name and line live in the title of the per-train
 * TRAIN answer. This module turns both into the same `TrainIdentity`, and maps
 * MÁV's Hungarian category words onto our `TrainType` enum.
 *
 * Pure and dependency-free on purpose: the worker, the API routes and (if it
 * wants to) the browser can all use it. Relative imports only - the worker is
 * compiled by plain tsc, which does not rewrite the `@/` alias.
 */
import { Train, TrainType } from '../../types';

/** Operator as vonatinfo names it in @Menetvonal. */
export type TrainOperator = 'MAV' | 'GYSEV' | 'HEV';

export interface TrainIdentity {
  /** Public train number as printed on timetables: "142", "3144", "H4004". */
  number: string;
  /** Proper name of the service, if it has one: "LISZT FERENC". */
  name?: string;
  /** Category as MÁV writes it: "EuroCity", "InterCity", "személyvonat", "HÉV". */
  category?: string;
  /** Line code: "S80", "Z72", "H5". */
  line?: string;
}

export interface TrainTitle extends TrainIdentity {
  origin?: string;
  destination?: string;
  /** Service day as printed, "2026.09.21". */
  serviceDate?: string;
  /**
   * Sections with a different category, when the train has any - typically a
   * rail replacement bus for part of the route:
   * [{ section: "Szentlőrinc - Pécs", category: "Vonatpótló InterCity busz" }].
   */
  segments?: Array<{ section: string; category: string }>;
}

// --- Public number from the positions feed ----------------------------------

/**
 * @TrainNumber is the operator's UIC company code followed by the public number:
 * MÁV "55142" is train 142, GYSEV "439094" is 9094. HÉV services come through as
 * "36H1004" and are known publicly (and in the TRAIN title) as "H1004".
 */
const OPERATOR_PREFIX: Record<TrainOperator, { prefix: string; rest: RegExp }> = {
  MAV: { prefix: '55', rest: /^\d+$/ },
  GYSEV: { prefix: '43', rest: /^\d+$/ },
  HEV: { prefix: '36', rest: /^H\d+$/ },
};

function asOperator(value: string | undefined): TrainOperator | undefined {
  const upper = (value || '').trim().toUpperCase();
  return upper === 'MAV' || upper === 'GYSEV' || upper === 'HEV' ? upper : undefined;
}

/**
 * Split a raw feed number into operator and public number.
 *
 * The operator from @Menetvonal decides which prefix to strip. Without one, a
 * prefix is stripped only when the rest has that operator's shape. Anything that
 * does not fit is returned unchanged - a raw number is better than a wrong one.
 */
export function parseFeedTrainNumber(
  rawNumber: string,
  menetvonal?: string
): { number: string; operator?: TrainOperator } {
  const raw = String(rawNumber ?? '').trim();
  const declared = asOperator(menetvonal);
  const candidates: TrainOperator[] = declared ? [declared] : ['MAV', 'GYSEV', 'HEV'];

  for (const operator of candidates) {
    const { prefix, rest } = OPERATOR_PREFIX[operator];
    const tail = raw.startsWith(prefix) ? raw.slice(prefix.length) : '';
    if (tail && rest.test(tail)) return { number: tail, operator };
  }
  return { number: raw, operator: declared };
}

/**
 * An ElviraID vonatinfo can answer a TRAIN request for: "9339647_260921",
 * HÉV "1578876#935_260921". Malformed ids ("_260921", or the
 * "vonatinfo:<number>" stand-in the feed parser uses) make it hang.
 */
export function isUsableElviraId(id: string | undefined | null): id is string {
  return !!id && /^[^_]+_\d+$/.test(id);
}

// --- TRAIN title -------------------------------------------------------------

const decodeEntities = (text: string) =>
  text
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const textOf = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** The inner HTML of `<th class="title">` in a TRAIN answer, or null. */
export function extractTitleCell(detailHtml: string): string | null {
  const match = detailHtml.match(/<th[^>]*class="title"[^>]*>([\s\S]*?)<\/th>/i);
  return match ? match[1] : null;
}

/** Hungarian upper case, the way MÁV prints train names. Needs at least one letter. */
const isUpperWord = (word: string) =>
  word === word.toLocaleUpperCase('hu-HU') && word !== word.toLocaleLowerCase('hu-HU');

/** "NYÍRSÉG - KRASZNA": a dash between two capitalised words belongs to the name. */
const isNameConnector = (word: string, next: string | undefined) => /^[-\u2013]$/.test(word) && !!next && isUpperWord(next);

/** Category abbreviations that are upper case and must not be read as a name. */
const UPPER_CASE_CATEGORIES = new Set(['IC', 'EC', 'EN', 'RJ', 'RJX', 'IR', 'NJ', 'EX']);

/**
 * "LISZT FERENC EuroCity" -> name "LISZT FERENC", category "EuroCity".
 * Names are printed in capitals, categories are not ("EuroCity", "személyvonat",
 * "railjet"), so the first word with a lower-case letter starts the category.
 * A trailing upper-case abbreviation ("TOKAJ IC" on station boards) is a
 * category, not part of the name.
 */
function splitNameAndCategory(input: string[]): { name?: string; category?: string } {
  const words = [...input];
  const nameWords: string[] = [];
  while (words.length > 0) {
    const [word, next] = words;
    const isName = (isUpperWord(word) && !(words.length === 1 && UPPER_CASE_CATEGORIES.has(word)))
      || (nameWords.length > 0 && isNameConnector(word, next));
    if (!isName) break;
    nameWords.push(words.shift()!);
  }
  return { name: nameWords.join(' ') || undefined, category: words.join(' ') || undefined };
}

/**
 * A station board's train label - the text after the number: "személy",
 * "zónázó", "gyorsított", "TOKAJ IC", "NYÍRSÉG - KRASZNA IC", or only a name
 * ("CÍVIS", whose category the board shows as an icon we cannot read).
 */
export function parseBoardLabel(label: string | undefined): { name?: string; category?: string } {
  return splitNameAndCategory(textOf(label || '').split(' ').filter(Boolean));
}

/**
 * Parse the title of a TRAIN answer. Shapes seen in live data:
 *
 *   142 LISZT FERENC EuroCity<br><font>(Budapest-Keleti - Wien Westbf, 2026.09.21.)</font>
 *   3144  személyvonat &nbsp;<span class="viszszam2">S80</span><br><font>(...)</font>
 *   185 HERNÁD <ul><li>Kosice - Miskolc-Tiszai: Vonatpótló InterCity busz</li>
 *                  <li>Miskolc-Tiszai - Budapest-Keleti: InterCity</li></ul><br><font>(...)</font>
 *   H4004  <br><font>(Batthyány tér - Szentendre, 2026.09.21.)</font>
 *
 * Accepts either the whole TRAIN html or just the title cell.
 */
export function parseTrainTitle(html: string): TrainTitle | null {
  if (!html) return null;
  const cell = extractTitleCell(html) ?? html;

  // "(Origin - Destination, 2026.09.21.)"
  let origin: string | undefined;
  let destination: string | undefined;
  let serviceDate: string | undefined;
  const relationMatch = textOf(cell).match(/\(([^()]*?),\s*(\d{4}\.\d{2}\.\d{2})\.?\s*\)/);
  if (relationMatch) {
    serviceDate = relationMatch[2];
    const [from, to] = relationMatch[1].split(' - ').map(part => part.trim());
    origin = from || undefined;
    destination = to || undefined;
  }

  const lineMatch = cell.match(/<span[^>]*class="viszszam2"[^>]*>([\s\S]*?)<\/span>/i);
  const line = lineMatch ? textOf(lineMatch[1]) || undefined : undefined;

  const segments: Array<{ section: string; category: string }> = [];
  for (const li of cell.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = textOf(li[1]);
    const colon = text.lastIndexOf(':');
    if (colon > 0) segments.push({ section: text.slice(0, colon).trim(), category: text.slice(colon + 1).trim() });
  }

  // What is left before the relation: "<number> [NAME] [category]".
  const head = textOf(
    cell
      .replace(/<font[\s\S]*?<\/font>/gi, ' ')
      .replace(/<ul[\s\S]*?<\/ul>/gi, ' ')
      .replace(/<span[^>]*class="viszszam2"[\s\S]*?<\/span>/gi, ' ')
      .split(/<br\s*\/?>/i)[0]
  );
  const words = head.split(' ').filter(Boolean);
  const number = words.shift();
  if (!number || !/\d/.test(number)) return null;

  const split = splitNameAndCategory(words);
  const name = split.name;
  let category = split.category;

  // Sectioned trains carry the category per section. The train is what it is
  // on rails; a replacement bus section does not make an InterCity a bus.
  if (!category && segments.length > 0) {
    const rail = segments.find(segment => !isBusCategory(segment.category));
    category = (rail ?? segments[0]).category;
  }

  return {
    number,
    name,
    category,
    line,
    origin,
    destination,
    serviceDate,
    segments: segments.length > 0 ? segments : undefined,
  };
}

/** Just the identity part of a parsed title - what gets cached and applied. */
export function identityOfTitle(title: TrainTitle | null | undefined): TrainIdentity | undefined {
  if (!title) return undefined;
  return { number: title.number, name: title.name, category: title.category, line: title.line };
}

// --- Category -> TrainType ---------------------------------------------------

/** Lower case, accents stripped: "InterRégió" -> "interregio". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function isBusCategory(category: string): boolean {
  const folded = foldText(category);
  return folded.includes('busz') || folded.includes('autobusz');
}

/** Budapest suburban line codes: S (személy), G (gyorsított), Z (zónázó), H (HÉV). */
const SUBURBAN_LINE = /^[SGZH]\d+$/i;

/**
 * Map a MÁV category onto the TrainType enum. The enum is deliberately small
 * (it drives the badge colours), so several categories share a value; the
 * precise word is kept in `Train.category`.
 *
 *   EuroCity                                  -> EC
 *   EuroNight, Nightjet                       -> EN
 *   railjet, railjet xpress                   -> RJ
 *   InterCity, Vonatpótló InterCity busz      -> IC
 *   HÉV, TramTrain, zónázó, gyorsított        -> S
 *   személyvonat on an S/G/Z line (S80, Z72)  -> S
 *   InterRégió, expresszvonat, gyorsvonat,
 *   sebesvonat, személyvonat, vonatpótló
 *   autóbusz, anything unknown                -> REG
 */
export function trainTypeForCategory(category?: string, line?: string, operator?: string): TrainType {
  if (asOperator(operator) === 'HEV') return TrainType.SUBURBAN;
  const folded = foldText(category || '');
  if (!folded) return TrainType.REGIONAL;

  const upper = (category || '').trim().toUpperCase();
  if (upper === 'EC') return TrainType.EC;
  if (upper === 'EN' || upper === 'NJ') return TrainType.NIGHT;
  if (upper === 'RJ' || upper === 'RJX') return TrainType.RAILJET;
  if (upper === 'IC') return TrainType.IC;

  if (folded.includes('eurocity')) return TrainType.EC;
  if (folded.includes('euronight') || folded.includes('nightjet')) return TrainType.NIGHT;
  if (folded.includes('railjet')) return TrainType.RAILJET;
  if (folded.includes('intercity')) return TrainType.IC;
  if (folded === 'hev' || folded.includes('tramtrain') || folded.includes('zonazo') || folded.startsWith('gyorsitott')) {
    return TrainType.SUBURBAN;
  }
  if (folded.startsWith('szemely') && line && SUBURBAN_LINE.test(line)) return TrainType.SUBURBAN;
  return TrainType.REGIONAL;
}

// --- HÉV ---------------------------------------------------------------------

/**
 * HÉV line from its termini. The TRAIN title of a HÉV service has no category
 * or line, but each line has its own outer terminus, so the relation is enough.
 * Order matters: H8 and H9 share Örs vezér tere.
 */
const HEV_LINES: Array<[RegExp, string]> = [
  [/csomor/, 'H9'],
  [/szentendre|bekasmegyer|batthyany ter|pomaz|filatorigat/, 'H5'],
  [/rackeve|tokol|dunaharaszti|kozvagohid|szigetszentmiklos/, 'H6'],
  [/csepel|boraros ter/, 'H7'],
  [/godollo|cinkota|ors vezer tere|kerepes|kistarcsa|matyasfold/, 'H8'],
];

export function hevLineFor(origin?: string, destination?: string): string | undefined {
  const relation = foldText(`${origin || ''} ${destination || ''}`);
  if (!relation.trim()) return undefined;
  return HEV_LINES.find(([pattern]) => pattern.test(relation))?.[1];
}

/**
 * Identity a train has without asking upstream. For HÉV that is everything we
 * will ever learn (their TRAIN title has no category), so HÉV never needs an
 * enrichment request.
 */
export function feedIdentity(train: Pick<Train, 'number' | 'operator' | 'origin' | 'destination'>): TrainIdentity | null {
  if (train.operator !== 'HEV') return null;
  return {
    number: train.number,
    category: 'HÉV',
    line: hevLineFor(train.origin?.name, train.destination?.name),
  };
}

/**
 * Put an identity onto a train. The title's number wins over the one derived
 * from the feed (they agree in every sample checked, but the title is what MÁV
 * prints). Fields the identity lacks keep what the train already has - a HÉV
 * title has no category or line, but the feed rule already supplied both.
 * `trainName` gets the proper name, else the line code - the slide-in shows it
 * as the route code, e.g. "[LISZT FERENC]" or "[S80]".
 */
export function applyTrainIdentity<T extends Train>(train: T, identity: TrainIdentity): T {
  if (identity.number) train.number = identity.number;
  train.category = identity.category ?? train.category;
  train.line = identity.line ?? train.line;
  train.trainName = identity.name ?? train.line ?? train.trainName;
  train.type = trainTypeForCategory(train.category, train.line, train.operator);
  return train;
}
