/**
 * Unit-style checks for the station matcher behind the ⌘K dialog, run with
 * `npm run check:stations`.
 *
 * The bug these pin down: searching for "Balatonföldvár" returned "Nincs
 * találat". The dialog only searched live trains, and no train starts or ends
 * at Balatonföldvár - it is an intermediate stop - so an existing station on
 * the busiest summer line was unfindable.
 *
 * No test runner in this repo, so this is a plain script: exit 0 on success,
 * exit 1 with PASS/FAIL per case otherwise.
 */
import { searchStations, upcomingArrivals } from '../src/lib/stations/search';
import { Station, Departure, TrainType } from '../src/types';

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        expected ${e}, got ${a}`);
}

function checkTrue(name: string, actual: boolean): void {
  if (!actual) failures++;
  console.log(`${actual ? 'PASS' : 'FAIL'}  ${name}`);
}

const station = (id: string, name: string): Station => ({ id, name });

const STATIONS: Station[] = [
  station('3393', 'Balatonföldvár'),
  station('7223', 'Tiszaföldvár'),
  station('1', 'Balatonfüred'),
  station('2', 'Balatonszentgyörgy'),
  station('3', 'Budapest-Keleti'),
  station('4', 'Budapest-Déli'),
  station('5', 'Szeged'),
  station('6', 'Győr'),
];

const names = (list: Station[]) => list.map(s => s.name);

console.log('searchStations');

check(
  'the reported query finds the station',
  names(searchStations(STATIONS, 'Balatonföldvár')),
  ['Balatonföldvár']
);

check(
  'accents are optional ("balatonfoldvar")',
  names(searchStations(STATIONS, 'balatonfoldvar')),
  ['Balatonföldvár']
);

check(
  'accents are optional ("gyor")',
  names(searchStations(STATIONS, 'gyor')),
  ['Győr']
);

check(
  'a name prefix matches, shortest name first',
  names(searchStations(STATIONS, 'balaton')),
  ['Balatonfüred', 'Balatonföldvár', 'Balatonszentgyörgy']
);

check(
  'a five-letter token matches inside a word',
  names(searchStations(STATIONS, 'füred')),
  ['Balatonfüred']
);

check(
  'a long token matches inside a word',
  names(searchStations(STATIONS, 'földvár')).sort(),
  ['Balatonföldvár', 'Tiszaföldvár']
);

check(
  'every token has to match ("budapest keleti")',
  names(searchStations(STATIONS, 'budapest keleti')),
  ['Budapest-Keleti']
);

check(
  'a hyphen splits like a space ("budapest-deli")',
  names(searchStations(STATIONS, 'budapest-deli')),
  ['Budapest-Déli']
);

check('an exact name outranks a longer one', names(
  searchStations([station('9', 'Szegedi'), station('5', 'Szeged')], 'szeged')
)[0], 'Szeged');

check('a short token never matches inside a word', names(searchStations(STATIONS, 'ge')), []);
check('an empty query matches nothing', names(searchStations(STATIONS, '')), []);
check('punctuation alone matches nothing', names(searchStations(STATIONS, '  -- ')), []);
check('an unknown name matches nothing', names(searchStations(STATIONS, 'zzzz')), []);
check('the limit is respected', searchStations(STATIONS, 'balaton', 2).length, 2);

console.log('\nupcomingArrivals');

const NOW = new Date('2026-09-21T12:40:00.000Z');

const arrival = (time: string, delay = 0): Departure => ({
  train: {
    id: 't',
    number: '849',
    type: TrainType.IC,
    position: { latitude: 0, longitude: 0 },
    speed: 0,
    heading: 0,
    delay,
  },
  // The board arrives as JSON, so `time` is an ISO string despite the Date type.
  time: time as unknown as Date,
  remoteStation: station('1', 'Nagykanizsa'),
  delay,
  status: 'ON_TIME' as Departure['status'],
});

const times = (list: Departure[]) => list.map(d => d.time as unknown as string);

check(
  'arrivals already past are dropped',
  times(upcomingArrivals([arrival('2026-09-21T03:34:00.000Z'), arrival('2026-09-21T14:48:00.000Z')], NOW)),
  ['2026-09-21T14:48:00.000Z']
);

check(
  'the board is sorted by time',
  times(upcomingArrivals(
    ['16:08', '14:48', '15:08'].map(t => arrival(`2026-09-21T${t}:00.000Z`)),
    NOW
  )),
  ['2026-09-21T14:48:00.000Z', '2026-09-21T15:08:00.000Z', '2026-09-21T16:08:00.000Z']
);

check(
  'the limit is respected',
  upcomingArrivals(
    ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map(t => arrival(`2026-09-21T${t}:00.000Z`)),
    NOW,
    5
  ).length,
  5
);

// Scheduled 12:35 but running 20 late, so it actually arrives at 12:55.
checkTrue(
  'a late train stays on the board past its scheduled time',
  upcomingArrivals([arrival('2026-09-21T12:35:00.000Z', 20)], NOW).length === 1
);

check('an unparseable time is dropped', upcomingArrivals([arrival('not a date')], NOW).length, 0);
check('an empty board stays empty', upcomingArrivals([], NOW).length, 0);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
