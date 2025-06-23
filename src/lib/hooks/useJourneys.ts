import { useQuery } from '@tanstack/react-query';
import { Journey } from '@/types';
import { api } from '@/lib/api/client';
import { useJourneyStore } from '@/lib/store';

export function useJourneySearch() {
  const { origin, destination, departureTime } = useJourneyStore();
  
  return useQuery({
    queryKey: ['journeys', origin?.id, destination?.id, departureTime.toISOString()],
    queryFn: () => 
      api.post<Journey[]>('/journeys/search', {
        originId: origin?.id,
        destinationId: destination?.id,
        departureTime: departureTime.toISOString(),
      }),
    enabled: !!(origin && destination),
  });
}

export function useJourney(journeyId: string | null) {
  return useQuery({
    queryKey: ['journey', journeyId],
    queryFn: () => api.get<Journey>(`/journeys/${journeyId}`),
    enabled: !!journeyId,
  });
}