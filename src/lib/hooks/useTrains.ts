import { useQuery } from '@tanstack/react-query';
import { Train } from '@/types';
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