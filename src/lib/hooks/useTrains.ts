import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, endpoints } from '@/lib/api/client';
import type { TrainSearchQuery } from '@/lib/api/endpoints';

export function useTrains() {
  const queryClient = useQueryClient();

  // Poll for updates every 30 seconds until WebSocket is implemented
  const queryInfo = useQuery({
    queryKey: ['trains'],
    queryFn: () => api.get(endpoints.trains.list()),
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
    queryFn: () => {
      // Unreachable: `enabled` keeps react-query from running this without an id.
      if (!trainId) throw new Error('useTrain: queryFn ran without a trainId');
      return api.get(endpoints.trains.byId(trainId));
    },
    enabled: !!trainId,
    refetchInterval: 10000, // 10 seconds
  });
}

export function useTrainRoute(gtfsId: string | null) {
  return useQuery({
    queryKey: ['train-route', gtfsId],
    queryFn: () => {
      // Unreachable: `enabled` keeps react-query from running this without an id.
      if (!gtfsId) throw new Error('useTrainRoute: queryFn ran without a gtfsId');
      return api.get(endpoints.trains.routeDetails(gtfsId));
    },
    enabled: !!gtfsId, // Only run the query if a gtfsId is provided
    staleTime: 5 * 60 * 1000, // Data is stale after 5 minutes, matching the backend cache
    refetchOnWindowFocus: false, // Route data is static for a trip, no need to refetch on focus
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
      // Unreachable: `enabled` keeps react-query from running this without an id.
      if (!stationId) throw new Error('useTimetable: queryFn ran without a stationId');
      return api.get(endpoints.stations.timetable(stationId, { type, date }));
    },
    enabled: !!stationId,
    refetchInterval: 30000, // 30 seconds for real-time updates
    staleTime: 15000, // 15 seconds
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}

export type TrainSearchParams = TrainSearchQuery;

export function useTrainSearch(params: TrainSearchParams) {
  const queryKey = ['trains', 'search', params];

  return useQuery({
    queryKey,
    queryFn: () => api.get(endpoints.trains.search(params)),
    enabled: !!(params.q || params.fromStationId || params.toStationId), // Only fetch if we have search criteria
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useFeaturedTrains() {
  return useQuery({
    queryKey: ['trains', 'featured'],
    queryFn: () => api.get(endpoints.trains.featured()),
    staleTime: 10 * 60 * 1000, // 10 minutes - featured trains don't change often
    refetchOnWindowFocus: false,
  });
}
