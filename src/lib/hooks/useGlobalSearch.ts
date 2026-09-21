import { useState, useEffect, useMemo } from 'react';
import { useTrainSearch } from './useTrainSearch';
import { useStations } from './useStations';
import { useTimetable } from './useTrains';
import { searchStations, upcomingArrivals } from '@/lib/stations/search';
import { Station, Train, Departure } from '@/types';

const STATION_LIMIT = 5;
const ARRIVAL_LIMIT = 5;

export type SearchItem =
  | { kind: 'station'; key: string; station: Station }
  | { kind: 'arrival'; key: string; arrival: Departure; station: Station }
  | { kind: 'train'; key: string; train: Train; matchedText: string; route?: { from: string; to: string } };

export interface SearchSection {
  title: string;
  /** Index of this section's first entry in the flat `items` array. */
  offset: number;
  items: SearchItem[];
  isLoading?: boolean;
}

/**
 * Everything the ⌘K dialog can find: stations, the trains due at the best
 * matching station, and live trains.
 *
 * Stations are matched in the browser against the full list (cached for an
 * hour) rather than through /api/stations?search=. That is one request instead
 * of one per keystroke, and the server-side filter is a plain `includes` that
 * still needs exact accents - "balatonfoldvar" would find nothing.
 */
export function useGlobalSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: stations, isLoading: stationsLoading } = useStations();
  const { results: trainResults, isLoading: trainsLoading, hasQuery } = useTrainSearch(query);

  const stationMatches = useMemo(
    () => (stations ? searchStations(stations, debouncedQuery, STATION_LIMIT) : []),
    [stations, debouncedQuery]
  );

  // Only the best station pulls a timetable, so typing a train number never
  // triggers a timetable request.
  const topStation = stationMatches[0] ?? null;
  const { data: timetable, isLoading: arrivalsLoading } = useTimetable(
    topStation?.id ?? null,
    'arrivals'
  );

  const arrivals = useMemo(
    () => (timetable ? upcomingArrivals(timetable, new Date(), ARRIVAL_LIMIT) : []),
    [timetable]
  );

  const sections = useMemo<SearchSection[]>(() => {
    if (!debouncedQuery) return [];

    const result: SearchSection[] = [];
    let offset = 0;

    const addSection = (section: Omit<SearchSection, 'offset'>) => {
      if (section.items.length === 0 && !section.isLoading) return;
      result.push({ ...section, offset });
      offset += section.items.length;
    };

    addSection({
      title: 'Állomások',
      items: stationMatches.map(station => ({
        kind: 'station' as const,
        key: `station-${station.id}`,
        station,
      })),
    });

    if (topStation) {
      addSection({
        title: `Érkező vonatok – ${topStation.name}`,
        isLoading: arrivalsLoading,
        items: arrivals.map((arrival, index) => ({
          kind: 'arrival' as const,
          key: `arrival-${topStation.id}-${arrival.train.id}-${index}`,
          arrival,
          station: topStation,
        })),
      });
    }

    addSection({
      title: 'Vonatok',
      items: trainResults.map(result => ({
        kind: 'train' as const,
        key: `train-${result.train.id}`,
        train: result.train,
        matchedText: result.matchedText,
        route: result.route,
      })),
    });

    return result;
  }, [debouncedQuery, stationMatches, topStation, arrivals, arrivalsLoading, trainResults]);

  // Flat list backing arrow-key navigation across section boundaries.
  const items = useMemo(() => sections.flatMap(section => section.items), [sections]);

  return {
    sections,
    items,
    isLoading: stationsLoading || trainsLoading,
    hasQuery,
  };
}
