import { useState, useEffect, useMemo } from 'react';
import { useTrains } from './useTrains';
import { Train } from '@/types';
import { searchTrains } from '@/lib/trains/search';

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

/**
 * Why a hit matched, in Hungarian. The matcher reports reasons in English
 * ("number 142", "to Szolnok") because it is shared with the API route, where
 * they end up in logs rather than in front of a visitor.
 */
function describeMatch(reason: string | undefined): string {
  if (!reason) return '';
  const [kind, ...rest] = reason.split(' ');
  const value = rest.join(' ');
  switch (kind) {
    case 'number': return `Vonatszám: ${value}`;
    case 'line': return `Vonal: ${value}`;
    case 'name': return `Név: ${value}`;
    case 'to': return `Cél: ${value}`;
    case 'from': return `Honnan: ${value}`;
    case 'via': return `Érinti: ${value}`;
    default: return reason; // a category label such as "InterCity"
  }
}

/**
 * Client-side train search for the ⌘K dialog, over the trains already in the
 * query cache. Uses the same matcher as /api/trains/search so that "IC" finds
 * InterCity services rather than every station containing the letters "ic".
 */
export function useTrainSearch(query: string) {
  const { data: trains, isLoading } = useTrains();
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo<SearchResult[]>(() => {
    if (!trains || debouncedQuery.length === 0) return [];

    return searchTrains(trains, debouncedQuery).map(hit => {
      const from = hit.train.origin?.name;
      const to = hit.train.destination?.name;
      return {
        type: from && to ? 'route' : 'train',
        train: hit.train,
        relevance: hit.score,
        matchedText: describeMatch(hit.matched[0]),
        route: from && to ? { from, to } : undefined,
      };
    });
  }, [trains, debouncedQuery]);

  return { results, isLoading, hasQuery: debouncedQuery.length > 0 };
}
