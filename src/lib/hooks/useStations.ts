import { useQuery } from '@tanstack/react-query';
import { Station, Departure } from '@/types';
import { api } from '@/lib/api/client';

export function useStations(search?: string) {
  return useQuery({
    queryKey: ['stations', search],
    queryFn: () => 
      api.get<Station[]>(search ? `/stations?search=${encodeURIComponent(search)}` : '/stations'),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useStation(stationId: string | null) {
  return useQuery({
    queryKey: ['station', stationId],
    queryFn: () => api.get<Station>(`/stations/${stationId}`),
    enabled: !!stationId,
  });
}

export function useDepartures(stationId: string | null, date?: Date) {
  const dateStr = date?.toISOString() || new Date().toISOString();
  
  return useQuery({
    queryKey: ['departures', stationId, dateStr],
    queryFn: () => 
      api.get<Departure[]>(`/stations/${stationId}/departures?date=${dateStr}`),
    enabled: !!stationId,
    refetchInterval: 60000, // 1 minute
  });
}