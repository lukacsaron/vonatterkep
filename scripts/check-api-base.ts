/**
 * Unit-style checks for the two things the typed API client must never get
 * wrong, run with `npm run check:api`:
 *
 *  1. resolveApiBase() normalising NEXT_PUBLIC_API_URL. Production once had it
 *     set to the bare origin while the code assumed it already ended in /api,
 *     so every request went to a PAGE route and came back as 404 HTML.
 *  2. Path parameters being percent-encoded. MAV ids contain ":" and "#"
 *     ("1:005510017", "1574713#905_260916") - a raw "#" makes the rest of the
 *     id a URL fragment and the request lands on the wrong route.
 *
 * No test runner in this repo, so this is a plain script: exit 0 on success,
 * exit 1 with PASS/FAIL per case otherwise.
 */
import { resolveApiBase } from '../src/lib/api/client';
import { endpoints } from '../src/lib/api/endpoints';

let failures = 0;

function check(name: string, actual: string, expected: string): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function withApiUrl(value: string | undefined): string {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = value;
  }
  return resolveApiBase();
}

console.log('resolveApiBase()');
const baseCases: Array<[string | undefined, string]> = [
  [undefined, '/api'],
  ['', '/api'],
  ['https://x.hu', 'https://x.hu/api'],
  ['https://x.hu/', 'https://x.hu/api'],
  ['https://x.hu/api', 'https://x.hu/api'],
  ['https://x.hu/api/', 'https://x.hu/api'],
];
for (const [input, expected] of baseCases) {
  check(`NEXT_PUBLIC_API_URL=${JSON.stringify(input)}`, withApiUrl(input), expected);
}

console.log('\nendpoint paths (ids must be percent-encoded)');
check('trains.list()', endpoints.trains.list().path, '/trains');
check(
  'trains.byId("1574713#905_260916")',
  endpoints.trains.byId('1574713#905_260916').path,
  '/trains/1574713%23905_260916'
);
check(
  'trains.routeDetails("1:005510017")',
  endpoints.trains.routeDetails('1:005510017').path,
  '/trains/1%3A005510017/route-details'
);
check('trains.search({ q: "IC 500" })', endpoints.trains.search({ q: 'IC 500' }).path, '/trains/search?q=IC+500');
check('trains.featured()', endpoints.trains.featured().path, '/trains/search?featured=true');
check('stations.list()', endpoints.stations.list().path, '/stations');
check('stations.list("")', endpoints.stations.list('').path, '/stations');
check('stations.list("Budapest-Keleti")', endpoints.stations.list('Budapest-Keleti').path, '/stations?search=Budapest-Keleti');
check(
  'stations.timetable("1:005510017", { type: "departures" })',
  endpoints.stations.timetable('1:005510017', { type: 'departures' }).path,
  '/stations/1%3A005510017/timetable?type=departures'
);
check(
  'stations.timetable("1:005510017", { type: "arrivals", date })',
  endpoints.stations.timetable('1:005510017', {
    type: 'arrivals',
    date: new Date('2026-09-16T08:30:00.000Z'),
  }).path,
  '/stations/1%3A005510017/timetable?type=arrivals&date=2026-09-16T08%3A30%3A00.000Z'
);
check('health()', endpoints.health().path, '/health');

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
