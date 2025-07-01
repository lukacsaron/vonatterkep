import { useState, useEffect, useMemo } from 'react';
import { useTrains } from './useTrains';
import { Train } from '@/types';

export interface SearchResult {
  type: 'train' | 'route';
  train: Train;
  relevance: number;
  matchedText: string;
  route?: {
    from: string;
    to: string;
    duration?: string;
  };
}

export function useTrainSearch(query: string) {
  const { data: trains, isLoading } = useTrains();
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce query to avoid excessive filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    if (!debouncedQuery || !trains || trains.length === 0) {
      return [];
    }

    const searchResults: SearchResult[] = [];

    trains.forEach(train => {
      const relevanceScores: { score: number; type: 'train' | 'route'; matchedText: string; route?: any }[] = [];

      // 1. Train number matching (highest priority)
      const trainNumber = train.number.toLowerCase();
      if (trainNumber.includes(debouncedQuery)) {
        const exactMatch = trainNumber === debouncedQuery ? 100 : 90;
        const startsWithMatch = trainNumber.startsWith(debouncedQuery) ? 85 : 70;
        relevanceScores.push({
          score: trainNumber === debouncedQuery ? exactMatch : startsWithMatch,
          type: 'train',
          matchedText: `Train ${train.number}`
        });
      }

      // 2. Train name matching (if available)
      if (train.trainName) {
        const trainName = train.trainName.toLowerCase();
        if (trainName.includes(debouncedQuery)) {
          relevanceScores.push({
            score: trainName === debouncedQuery ? 95 : 80,
            type: 'train',
            matchedText: `${train.trainName} (${train.number})`
          });
        }
      }

      // 3. Destination matching
      if (train.destination?.name) {
        const destination = train.destination.name.toLowerCase();
        if (destination.includes(debouncedQuery)) {
          const originName = train.origin?.name || 'Unknown origin';
          relevanceScores.push({
            score: 60,
            type: 'route',
            matchedText: `To ${train.destination.name}`,
            route: {
              from: originName,
              to: train.destination.name
            }
          });
        }
      }
      
      // 3.1. Origin matching (new)
      if (train.origin?.name) {
        const origin = train.origin.name.toLowerCase();
        if (origin.includes(debouncedQuery)) {
          const destinationName = train.destination?.name || 'Unknown destination';
          relevanceScores.push({
            score: 60,
            type: 'route',
            matchedText: `From ${train.origin.name}`,
            route: {
              from: train.origin.name,
              to: destinationName
            }
          });
        }
      }

      // 4. Route search - prioritize origin/destination, fallback to route data
      const originName = train.origin?.name;
      const destinationName = train.destination?.name;
      
      if (originName && destinationName) {
        // Use the new origin/destination fields
        const routeText = `${originName} → ${destinationName}`.toLowerCase();
        if (routeText.includes(debouncedQuery)) {
          relevanceScores.push({
            score: 55,
            type: 'route',
            matchedText: `${originName} → ${destinationName}`,
            route: {
              from: originName,
              to: destinationName
            }
          });
        }
      } else if (train.route && train.route.length > 0) {
        // Fallback to detailed route data
        const routeStations = train.route.map(stop => stop.station.name.toLowerCase());
        const matchingStations = routeStations.filter(station => station.includes(debouncedQuery));
        
        if (matchingStations.length > 0) {
          const firstStation = train.route[0]?.station.name || '';
          const lastStation = train.route[train.route.length - 1]?.station.name || train.destination?.name || '';
          
          relevanceScores.push({
            score: 55,
            type: 'route',
            matchedText: `${firstStation} → ${lastStation}`,
            route: {
              from: firstStation,
              to: lastStation
            }
          });
        }
      }

      // Add the best match for this train
      if (relevanceScores.length > 0) {
        const bestMatch = relevanceScores.reduce((best, current) => 
          current.score > best.score ? current : best
        );

        searchResults.push({
          type: bestMatch.type,
          train,
          relevance: bestMatch.score,
          matchedText: bestMatch.matchedText,
          route: bestMatch.route
        });
      }
    });

    // Sort by relevance (highest first) and limit to 10 results
    return searchResults
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10);
  }, [debouncedQuery, trains]);

  return {
    results,
    isLoading,
    hasQuery: debouncedQuery.length > 0
  };
}