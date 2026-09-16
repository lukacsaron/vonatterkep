import { useQuery } from '@tanstack/react-query';
import { api, endpoints } from '@/lib/api/client';

export function useStations(search?: string) {
  return useQuery({
    queryKey: ['stations', search],
    queryFn: () => api.get(endpoints.stations.list(search)),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
