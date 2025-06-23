import { useQuery } from '@tanstack/react-query';
import { Train, Departure, TrainSearchResult } from '@/types';
import { api } from '@/lib/api/client';

export function useTrains() {
  // Don't use bounds in queryKey to prevent constant refetching during zoom
  // Hungary is small enough that we can fetch all trains without performance issues
  return useQuery({
    queryKey: ['trains'], // Stable key - no bounds dependency
    queryFn: () => api.get<Train[]>('/trains'), // Fetch all trains
    refetchInterval: 30000, // 30 seconds
    staleTime: 15000, // 15 seconds
    // Keep data fresh but prevent excessive refetching during user interactions
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchIntervalInBackground: false,
  });
}

export function useTrain(trainId: string | null) {
  return useQuery({
    queryKey: ['train', trainId],
    queryFn: () => api.get<Train>(`/trains/${trainId}`),
    enabled: !!trainId,
    refetchInterval: 10000, // 10 seconds
  });
}

export function useTimetable(
  stationId: string | null,
  type: 'departures' | 'arrivals',
  date?: Date
) {
  const dateParam = date ? date.toISOString() : undefined;
  
  return useQuery({
    queryKey: ['timetable', stationId, type, dateParam],
    queryFn: () => {
      const params = new URLSearchParams({
        type,
        ...(dateParam && { date: dateParam }),
      });
      return api.get<Departure[]>(`/stations/${stationId}/timetable?${params}`);
    },
    enabled: !!stationId,
    refetchInterval: 30000, // 30 seconds for real-time updates
    staleTime: 15000, // 15 seconds
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}

export interface TrainSearchParams {
  q?: string; // General search query for train number or name
  fromStationId?: string; // UIC Code of the origin station
  toStationId?: string; // UIC Code of the destination station
  date?: Date; // The date to search for, defaults to today
}

export function useTrainSearch(params: TrainSearchParams) {
  const searchParams = new URLSearchParams();
  
  if (params.q) searchParams.set('q', params.q);
  if (params.fromStationId) searchParams.set('fromStationId', params.fromStationId);
  if (params.toStationId) searchParams.set('toStationId', params.toStationId);
  if (params.date) searchParams.set('date', params.date.toISOString().split('T')[0]); // YYYY-MM-DD format
  
  const queryKey = ['trains', 'search', params];
  const queryString = searchParams.toString();
  
  return useQuery({
    queryKey,
    queryFn: () => api.get<TrainSearchResult[]>(`/trains/search?${queryString}`),
    enabled: !!(params.q || params.fromStationId || params.toStationId), // Only fetch if we have search criteria
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useFeaturedTrains() {
  return useQuery({
    queryKey: ['trains', 'featured'],
    queryFn: () => api.get<TrainSearchResult[]>('/trains/search?featured=true'),
    staleTime: 10 * 60 * 1000, // 10 minutes - featured trains don't change often
    refetchOnWindowFocus: false,
  });
}