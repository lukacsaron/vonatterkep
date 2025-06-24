import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { Train, Departure, TrainSearchResult } from '@/types';
import { api } from '@/lib/api/client';

export function useTrains() {
  const queryClient = useQueryClient();

  // Poll for updates every 30 seconds until WebSocket is implemented
  const queryInfo = useQuery({
    queryKey: ['trains'],
    queryFn: () => api.get<Train[]>('/trains'),
    staleTime: 15000, // 15 seconds
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30000, // 30 seconds
  });

  // TODO: Re-enable WebSocket when backend is ready
  // useEffect(() => {
  //   // Connect to the WebSocket server
  //   const socket: Socket = io({ path: '/api/socket' });

  //   socket.on('connect', () => {
  //     console.log('🔌 WebSocket connected:', socket.id);
  //   });

  //   // Listener for real-time updates
  //   socket.on('trains-update', (trains: Train[]) => {
  //     console.log(`📡 Received ${trains.length} train updates via WebSocket.`);
  //     queryClient.setQueryData(['trains'], trains);
  //   });
    
  //   socket.on('initial-data', (trains: Train[]) => {
  //       console.log(`📂 Received ${trains.length} initial trains via WebSocket.`);
  //       queryClient.setQueryData(['trains'], trains);
  //   });

  //   socket.on('disconnect', () => {
  //     console.log('🔌 WebSocket disconnected.');
  //   });

  //   return () => {
  //     socket.disconnect();
  //   };
  // }, [queryClient]);

  // Return the same data structure as before for component compatibility
  return queryInfo;
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