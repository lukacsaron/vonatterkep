import { useState, useEffect, useMemo } from 'react';
import { useTrains, useTimetable } from './useTrains';
import { useStations } from './useStations';
import { matchStations, matchTrain, upcomingArrivals } from '@/lib/search/match';
import { Station, Train, Departure } from '@/types';

const STATION_LIMIT = 5;
const ARRIVAL_LIMIT = 5;
const TRAIN_LIMIT = 8;
const DEBOUNCE_MS = 150;

export type SearchItem =
  | { kind: 'station'; key: string; station: Station }
  | { kind: 'arrival'; key: string; arrival: Departure; station: Station }
  | { kind: 'train'; key: string; train: Train; label: string };

export interface SearchSection {
  title: string;
  /** Index of this section's first entry in the flat `items` array. */
  offset: number;
  items: SearchItem[];
  isLoading?: boolean;
}

export function useGlobalSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: stations, isLoading: stationsLoading } = useStations();
  const { data: trains, isLoading: trainsLoading } = useTrains();

  const stationMatches = useMemo(
    () => (stations ? matchStations(stations, debouncedQuery, STATION_LIMIT) : []),
    [stations, debouncedQuery]
  );

  // Only the best station match pulls a timetable, so typing a train number
  // never triggers a timetable request.
  const topStation = stationMatches[0] ?? null;
  const { data: timetable, isLoading: arrivalsLoading } = useTimetable(
    topStation?.id ?? null,
    'arrivals'
  );

  const arrivals = useMemo(
    () => (timetable ? upcomingArrivals(timetable, new Date(), ARRIVAL_LIMIT) : []),
    [timetable]
  );

  const trainMatches = useMemo(() => {
    if (!debouncedQuery || !trains) return [];

    return trains
      .map(train => ({ train, match: matchTrain(train, debouncedQuery) }))
      .filter((entry): entry is { train: Train; match: NonNullable<typeof entry.match> } =>
        entry.match !== null
      )
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, TRAIN_LIMIT);
  }, [trains, debouncedQuery]);

  const sections = useMemo<SearchSection[]>(() => {
    if (!debouncedQuery) return [];

    const result: SearchSection[] = [];
    let offset = 0;

    const addSection = (section: Omit<SearchSection, 'offset'>) => {
      result.push({ ...section, offset });
      offset += section.items.length;
    };

    if (stationMatches.length > 0) {
      addSection({
        title: 'Állomások',
        items: stationMatches.map(station => ({
          kind: 'station' as const,
          key: `station-${station.id}`,
          station,
        })),
      });
    }

    if (topStation && (arrivals.length > 0 || arrivalsLoading)) {
      addSection({
        title: `Érkező vonatok — ${topStation.name}`,
        isLoading: arrivalsLoading,
        items: arrivals.map((arrival, index) => ({
          kind: 'arrival' as const,
          key: `arrival-${topStation.id}-${arrival.train.id}-${index}`,
          arrival,
          station: topStation,
        })),
      });
    }

    if (trainMatches.length > 0) {
      addSection({
        title: 'Vonatok',
        items: trainMatches.map(({ train, match }) => ({
          kind: 'train' as const,
          key: `train-${train.id}`,
          train,
          label: match.label,
        })),
      });
    }

    return result;
  }, [debouncedQuery, stationMatches, topStation, arrivals, arrivalsLoading, trainMatches]);

  // Flat list backing arrow-key navigation across section boundaries.
  const items = useMemo(() => sections.flatMap(section => section.items), [sections]);

  return {
    sections,
    items,
    isLoading: stationsLoading || trainsLoading,
    hasQuery: debouncedQuery.length > 0,
  };
}
