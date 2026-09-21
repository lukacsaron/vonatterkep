/**
 * Tests for the pure search matcher. No test framework in this repo, so this
 * is a standalone script: `npx tsx scripts/test-search-match.ts`
 */
import assert from 'node:assert/strict';
import {
  normalize,
  matchStations,
  matchTrain,
  upcomingArrivals,
} from '../src/lib/search/match';
import { Station, Train, Departure } from '../src/types';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

const station = (id: string, name: string): Station => ({
  id,
  name,
  coordinates: { latitude: 0, longitude: 0 },
});

const STATIONS: Station[] = [
  station('3393', 'Balatonföldvár'),
  station('7223', 'Tiszaföldvár'),
  station('1', 'Balatonfüred'),
  station('2', 'Balatonszentgyörgy'),
  station('3', 'Budapest-Déli'),
  station('4', 'Szeged'),
];

const names = (list: Station[]) => list.map(s => s.name);

console.log('normalize');
test('strips Hungarian diacritics and lowercases', () => {
  assert.equal(normalize('Balatonföldvár'), 'balatonfoldvar');
  assert.equal(normalize('Győr'), 'gyor');
  assert.equal(normalize('Nyíregyháza'), 'nyiregyhaza');
});

test('trims surrounding whitespace', () => {
  assert.equal(normalize('  Szeged '), 'szeged');
});

console.log('matchStations');
test('finds a station typed without accents', () => {
  // The live API returns [] for this query today; this is the regression.
  assert.deepEqual(names(matchStations(STATIONS, 'balatonfoldvar')), ['Balatonföldvár']);
});

test('finds a station typed with accents', () => {
  assert.deepEqual(names(matchStations(STATIONS, 'Balatonföldvár')), ['Balatonföldvár']);
});

test('matches on a partial prefix', () => {
  assert.deepEqual(names(matchStations(STATIONS, 'balatonföldv')), ['Balatonföldvár']);
});

test('returns every station containing a mid-word query', () => {
  const result = names(matchStations(STATIONS, 'földvár'));
  assert.ok(result.includes('Balatonföldvár'), 'expected Balatonföldvár');
  assert.ok(result.includes('Tiszaföldvár'), 'expected Tiszaföldvár');
});

test('ranks a prefix match above a mid-string match', () => {
  const result = names(matchStations(STATIONS, 'balaton'));
  assert.equal(result[0], 'Balatonfüred', 'shortest prefix match should lead');
  assert.ok(result.includes('Balatonföldvár'));
});

test('ranks an exact match first', () => {
  const result = names(matchStations([station('9', 'Szegedi'), station('4', 'Szeged')], 'szeged'));
  assert.equal(result[0], 'Szeged');
});

test('respects the limit', () => {
  assert.equal(matchStations(STATIONS, 'balaton', 2).length, 2);
});

test('returns nothing for an empty query', () => {
  assert.deepEqual(matchStations(STATIONS, ''), []);
  assert.deepEqual(matchStations(STATIONS, '   '), []);
});

test('returns nothing for a query that matches no station', () => {
  assert.deepEqual(matchStations(STATIONS, 'zzzz'), []);
});

console.log('matchTrain');
const train = (over: Partial<Train>): Train => ({
  id: 't',
  number: '849',
  type: 'IC' as Train['type'],
  position: { latitude: 0, longitude: 0 },
  speed: 0,
  heading: 0,
  delay: 0,
  ...over,
});

test('matches on train number', () => {
  assert.ok(matchTrain(train({ number: '849' }), '849'));
});

test('matches on train name without accents', () => {
  assert.ok(matchTrain(train({ trainName: 'TÓPART' }), 'topart'));
});

test('matches on origin and destination', () => {
  const t = train({ origin: station('1', 'Nagykanizsa'), destination: station('2', 'Budapest-Déli') });
  assert.ok(matchTrain(t, 'nagykanizsa'));
  assert.ok(matchTrain(t, 'budapest'));
});

test('scores an exact train number above a partial one', () => {
  const exact = matchTrain(train({ number: '849' }), '849');
  const partial = matchTrain(train({ number: '8490' }), '849');
  assert.ok(exact && partial && exact.score > partial.score);
});

test('returns null when nothing matches', () => {
  assert.equal(matchTrain(train({ number: '849' }), 'zzzz'), null);
});

console.log('upcomingArrivals');
const NOW = new Date('2026-09-21T12:40:00.000Z');
const arrival = (time: string): Departure =>
  ({
    train: train({}),
    // The API sends ISO strings even though the type says Date.
    time: time as unknown as Date,
    remoteStation: station('1', 'Nagykanizsa'),
    delay: 0,
    status: 'ON_TIME' as Departure['status'],
  });

test('drops arrivals already in the past', () => {
  const result = upcomingArrivals([arrival('2026-09-21T03:34:00.000Z'), arrival('2026-09-21T14:48:00.000Z')], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].time as unknown as string, '2026-09-21T14:48:00.000Z');
});

test('sorts ascending by time', () => {
  const result = upcomingArrivals(
    [arrival('2026-09-21T16:08:00.000Z'), arrival('2026-09-21T14:48:00.000Z'), arrival('2026-09-21T15:08:00.000Z')],
    NOW
  );
  assert.deepEqual(result.map(r => r.time as unknown as string), [
    '2026-09-21T14:48:00.000Z',
    '2026-09-21T15:08:00.000Z',
    '2026-09-21T16:08:00.000Z',
  ]);
});

test('limits the number returned', () => {
  const list = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map(h =>
    arrival(`2026-09-21T${h}:00.000Z`)
  );
  assert.equal(upcomingArrivals(list, NOW, 5).length, 5);
});

test('accounts for delay when deciding what has passed', () => {
  // Scheduled 12:35, running 20 late -> actually arrives 12:55, still upcoming at 12:40.
  const delayed = { ...arrival('2026-09-21T12:35:00.000Z'), delay: 20 };
  assert.equal(upcomingArrivals([delayed], NOW).length, 1);
});

test('handles an empty list', () => {
  assert.deepEqual(upcomingArrivals([], NOW), []);
});

console.log(`\n${passed} passed`);
