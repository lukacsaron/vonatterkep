// MÁV upstream client.
//
// Everything comes from vonatinfo.mav.hu, MÁV's own public train tracker - the
// one MÁV host this server can still reach:
//   - mavplusz.hu (the MÁVPlusz/EMMA OpenTripPlanner backend) IP-blocks this
//     server: every path answers 403 "host limit achived".
//   - vim.mav-start.hu (the old MobileService API) is dead: 404 over https, 500
//     over http, no replacement host.
// Station lists come from MÁV's GTFS feed instead (src/lib/gtfs/*).
import { TrainDetails, TrainStop } from '../../types';
import { budapestToday, vonatinfoDateParam } from '../time/budapest';
import { CalendarDate, createRouteSequencer, nearestTo, atDay, parseClock } from '../time/wallClock';
import { identityOfTitle, isUsableElviraId, parseFeedTrainNumber, parseTrainTitle, TrainIdentity, TrainTitle } from '../trains/identity';

const MAV_VONATINFO_API = 'https://vonatinfo.mav.hu/map.aspx/getData';

const MAV_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

/** A non-2xx answer from vonatinfo. 403/429 mean "slow down" - see isRateLimit. */
export class VonatinfoHttpError extends Error {
  constructor(public readonly status: number, label: string) {
    super(`vonatinfo ${label} HTTP ${status}`);
    this.name = 'VonatinfoHttpError';
  }

  get isRateLimit(): boolean {
    return this.status === 403 || this.status === 429;
  }
}

/**
 * The single place that talks to vonatinfo. The endpoint is an ASP.NET web
 * service: every answer is wrapped in `d.result`, and the XML-derived fields
 * are @-prefixed. No call may hang - the worker and the request handlers both
 * wait on these.
 */
async function postVonatinfo(body: unknown, label: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(MAV_VONATINFO_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Referer': 'https://vonatinfo.mav.hu/',
        'User-Agent': MAV_USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new VonatinfoHttpError(response.status, label);
    const payload = (await response.json()) as any;
    return payload?.d?.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Station shape of the hardcoded fallback list in /api/stations. */
export interface MavStation {
  Nev: string;
  UicKod: string;
  GPS?: {
    Lat: number;
    Lng: number;
  };
  /** Platform codes, when known. */
  Vaganyok?: string[];
}

/** One train from vonatinfo's positions feed (TRAINS). */
export interface MavTrain {
  /** Raw @TrainNumber, operator prefix included ("55142"). Unique across operators. */
  VonatSzam: string;
  /** Public number with the operator prefix stripped ("142") - see parseFeedTrainNumber. */
  publicNumber: string;
  /** @Menetvonal: "MAV", "GYSEV" or "HEV". */
  operator?: string;
  /** Destination station name, from @Relation. */
  Celallomas: string;
  /** Origin station name, from @Relation. */
  Kiindulas?: string;
  UtolsoGPS?: {
    Lat: number;
    Lng: number;
    Ido: string;
    Sebesseg: number;
    Irany: number;
  };
  /** Delay in minutes (@Delay). */
  Keses: number;
  /** vonatinfo ElviraID of the run, or "vonatinfo:<raw number>" when the feed's id is unusable. */
  gtfsId?: string;
}

export interface MavDeparture {
  VonatSzam: string;
  Indulas: string;
  Celallomas: string;
  Vagany?: string;
  Keses: number;
  /** Train label as the station board prints it: "személy", "TOKAJ IC", "CÍVIS", "zónázó". */
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
  /** Train label as the station board prints it: "személy", "TOKAJ IC", "CÍVIS", "zónázó". */
  Tipus: string;
  /** vonatinfo ElviraID of the train, when known - same id the live feed uses as gtfsId. */
  elviraId?: string;
  /** Actual (realtime) time as an ISO instant, when reported. */
  actualTime?: string;
}

/** One vonatinfo TRAIN answer, parsed. */
export interface VonatinfoTrain {
  /** Encoded polyline of the route ("" when vonatinfo sends none). */
  geometry: string;
  stops: TrainStop[];
  /** Number, name, category and line from the timetable's title row. */
  title: TrainTitle | null;
}

/**
 * The slide-in asks for a train (/api/trains/[gtfsId]) and its route
 * (/api/trains/[gtfsId]/route-details) at the same moment, and both are the
 * same TRAIN request. Share one upstream call between them, and between
 * everyone who opens the same train within a short window.
 */
const TRAIN_MEMO_TTL_MS = 30 * 1000;
const trainMemo = new Map<string, { expiresAt: number; result: Promise<VonatinfoTrain | null> }>();

class MavApiClient {
  /**
   * Full trip details for one train: every stop with times and delays, plus
   * the train's identity from the same answer. vonatinfo only; ids stored as
   * gtfsId are ElviraIDs, which is what it expects.
   */
  async getTrainDetails(elviraId: string): Promise<TrainDetails | null> {
    let train: VonatinfoTrain | null;
    try {
      train = await this.getTrainFromVonatinfo(elviraId);
    } catch (error) {
      console.warn(`vonatinfo trip lookup failed for ${elviraId}:`, error);
      return null;
    }
    if (!train || (train.stops.length === 0 && !train.title)) return null;

    const stops = train.stops;
    // Overall delay: the latest real delay seen along the route so far.
    const passed = stops.filter(st => st.isPassed);
    const lastPassed = passed[passed.length - 1];
    const overallDelay = lastPassed ? (lastPassed.arrivalDelay || lastPassed.departureDelay || 0) : 0;

    return {
      destination: stops[stops.length - 1]?.name || train.title?.destination || '',
      trainName: train.title?.name,
      routeShortName: train.title?.line,
      overallDelay,
      stops,
      identity: identityOfTitle(train.title),
    };
  }

  /** Just the identity (number, name, category, line) of one train. One TRAIN request. */
  async getTrainIdentity(elviraId: string): Promise<TrainIdentity | null> {
    const train = await this.getTrainFromVonatinfo(elviraId);
    return identityOfTitle(train?.title) ?? null;
  }

  /**
   * Live positions from vonatinfo.mav.hu.
   *
   * Returns every running train in one ~9 KB response with @Delay already
   * included, so there is no per-train delay lookup and no bbox paging.
   * Fields are @-prefixed because the payload is XML converted to JSON.
   */
  private async getTrainPositionsFromVonatinfo(): Promise<MavTrain[]> {
    const result = await postVonatinfo({ a: 'TRAINS', jo: { history: false, id: '' } }, 'TRAINS', 20000);
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
      const { number: publicNumber, operator } = parseFeedTrainNumber(number, t['@Menetvonal']);
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
        publicNumber,
        operator: operator ?? (t['@Menetvonal'] ? String(t['@Menetvonal']) : undefined),
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
      };
    }).filter(t => Number.isFinite(t.UtolsoGPS!.Lat) && Number.isFinite(t.UtolsoGPS!.Lng));

    console.log(`\u2705 vonatinfo: ${trains.length} live trains (1 request, delays included)`);
    return trains;
  }

  /**
   * Full route for one train from vonatinfo.mav.hu, plus its identity.
   *
   * vonatinfo returns a rendered HTML table plus an encoded polyline, keyed by
   * ElviraID (which is what we store as gtfsId). The table's title row carries
   * number, name, category and line - see parseTrainTitle.
   *
   * Row shape:
   *   <tr class="row_past_even">      <- row_past_* means already passed
   *     <td>7</td>                                   km
   *     <td><a onclick="...i: '392', a: 'Rácalmás'">Rácalmás</a></td>
   *     <td>18:39<br><span style="color:red">18:38</span></td>   scheduled / actual arrival
   *     <td>18:39<br><span style="color:green">18:39</span></td> scheduled / actual departure
   *     <td>3</td>                                   platform
   *
   * Concurrent and repeated requests for the same train within 30 s share one
   * upstream call (see trainMemo).
   */
  async getTrainFromVonatinfo(elviraId: string): Promise<VonatinfoTrain | null> {
    // A malformed id makes vonatinfo hang rather than answer, so do not ask.
    if (!isUsableElviraId(elviraId)) {
      console.warn(`Skipping vonatinfo route lookup for unusable id "${elviraId}"`);
      return null;
    }

    const now = Date.now();
    for (const [key, entry] of trainMemo) {
      if (entry.expiresAt <= now) trainMemo.delete(key);
    }
    const memo = trainMemo.get(elviraId);
    if (memo) return memo.result;

    const result = this.fetchTrainFromVonatinfo(elviraId);
    trainMemo.set(elviraId, { expiresAt: now + TRAIN_MEMO_TTL_MS, result });
    // A failure must not be served to the next caller for 30 s.
    result.catch(() => trainMemo.delete(elviraId));
    return result;
  }

  private async fetchTrainFromVonatinfo(elviraId: string): Promise<VonatinfoTrain | null> {
    const result = await postVonatinfo({ a: 'TRAIN', jo: { v: elviraId } }, 'TRAIN', 12000);
    const rawHtml: string = result?.html || '';
    if (!rawHtml) return null;

    // Geometry: first polyline in `line`.
    let geometry = '';
    const line = result?.line;
    if (Array.isArray(line) && line.length > 0 && typeof line[0]?.points === 'string') {
      geometry = line[0].points;
    }

    const title = parseTrainTitle(rawHtml);

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

    // No log line here: the worker calls this for identity enrichment and logs
    // one summary per cycle; the API routes log their own outcome.
    return { geometry, stops, title };
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
   *         train number and label, then "[origin time, origin] -- [destination, destination time]"
   *
   * The label is "[NAME] [category]" - "személy", "zónázó", "TOKAJ IC", or just
   * a name ("CÍVIS"). Every row carries the train's ElviraID, the same id the
   * live positions feed uses as gtfsId, so a board row can be linked to its train.
   */
  async getStationBoardFromVonatinfo(
    stationName: string,
    date: Date = new Date()
  ): Promise<{ departures: MavDeparture[]; arrivals: MavArrival[] }> {
    const result = await postVonatinfo(
      { a: 'STATION', jo: { a: stationName, d: vonatinfoDateParam(date), language: '1' } },
      'STATION',
      15000
    );
    const rawHtml: string = typeof result === 'string' ? result : result?.html || '';

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
      const trainType = text(numberMatch ? trainPart.replace(numberMatch[0], '') : '');
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

  /**
   * Every running train with position and delay. One vonatinfo request.
   * Never throws: an empty list means "no fresh data", which the worker treats
   * as a failed cycle (it keeps the previous cache and backs off).
   */
  async getTrainPositions(): Promise<MavTrain[]> {
    try {
      return await this.getTrainPositionsFromVonatinfo();
    } catch (error) {
      console.error('vonatinfo TRAINS request failed - no fresh positions this cycle:', error);
      return [];
    }
  }
}

export const mavApi = new MavApiClient();
