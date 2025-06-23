### The Strategy

1.  **Centralize Data Fetching Logic:** We will modify the `useTrains` hook in `src/lib/hooks/useTrains.ts` to be the single source of truth for train data. It will automatically refetch data every 30 seconds.
2.  **Expose Refresh Controls:** The `useTrains` hook will be updated to return the `refetch` function and the `isFetching` state from TanStack Query.
3.  **Enhance the UI:** The `TrainMap.tsx` component will consume these new properties. We'll add a manual refresh button that uses the `refetch` function and displays a loading state based on `isFetching`.

This approach ensures that the data is fetched, cached, and updated in the background cleanly, and the UI simply reacts to the data changes provided by the hook.

---

### Step 1: Update the `useTrains` Hook

First, we'll modify the `useTrains` hook to return the necessary controls for manual refresh and to show the fetching state.

**File to Edit:** `src/lib/hooks/useTrains.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { Train, Departure, TrainSearchResult } from '@/types';
import { api } from '@/lib/api/client';

export function useTrains() {
  // We will return the entire result of useQuery to get access to refetch and isFetching
  return useQuery({
    queryKey: ['trains'],
    queryFn: () => api.get<Train[]>('/trains'),
    // --- KEY CHANGES ---
    // 1. Fetch data every 30 seconds. This was already correctly configured.
    refetchInterval: 30000,
    // 2. Data is considered stale after 15 seconds, prompting a refresh sooner on window focus.
    staleTime: 15000,
    // 3. Keep refetching on window focus to get the latest data when the user returns.
    refetchOnWindowFocus: true,
  });
}

// No changes needed for the other hooks, but shown for context.
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
  q?: string;
  fromStationId?: string;
  toStationId?: string;
  date?: Date;
}

export function useTrainSearch(params: TrainSearchParams) {
  const searchParams = new URLSearchParams();
  
  if (params.q) searchParams.set('q', params.q);
  if (params.fromStationId) searchParams.set('fromStationId', params.fromStationId);
  if (params.toStationId) searchParams.set('toStationId', params.toStationId);
  if (params.date) searchParams.set('date', params.date.toISOString().split('T')[0]);
  
  const queryKey = ['trains', 'search', params];
  const queryString = searchParams.toString();
  
  return useQuery({
    queryKey,
    queryFn: () => api.get<TrainSearchResult[]>(`/trains/search?${queryString}`),
    enabled: !!(params.q || params.fromStationId || params.toStationId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useFeaturedTrains() {
  return useQuery({
    queryKey: ['trains', 'featured'],
    queryFn: () => api.get<TrainSearchResult[]>('/trains/search?featured=true'),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
```

### Step 2: Update the `TrainMap` Component

Next, we will update the `TrainMap` component to use the `refetch` function and `isFetching` state, and we'll add the new refresh button.

**File to Edit:** `src/app/components/Map/TrainMap.tsx`

We will add the `RefreshCw` icon from `lucide-react` and the `cn` utility to handle conditional classes for the button's loading state.

```typescript
'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore } from '@/lib/store';
import { useTrains } from '@/lib/hooks/useTrains';
import { TrainInfoCard } from '../Train/TrainInfoCard';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { DelayLegend } from '../UI/DelayLegend';
import { Train, DelayCategory } from '@/types';
import { getDelayCategory, getDelayColor } from '@/lib/utils';
// --- ADDED: Import RefreshCw icon and cn utility ---
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// Set Mapbox access token
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

export function TrainMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [showRailwayOverlay, setShowRailwayOverlay] = useState(true);
  
  const { selectedTrain, focusedTrain, setSelectedTrain, setFocusedTrain, setBounds } = useMapStore();
  // --- CHANGED: Destructure `isFetching` and `refetch` from the useTrains hook ---
  const { data: trains, isLoading, isFetching, error, refetch } = useTrains();

  // (The rest of the component's useEffects and functions remain the same)
  // ...
  // ... (all the existing useEffects for map initialization, train updates, etc.)
  // ...

  if (!mapboxgl.accessToken) {
    // ... (existing return for no token)
  }

  if (mapError) {
    // ... (existing return for map error)
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Train info popup */}
      {selectedTrain && (
        <div className="absolute top-4 right-4 z-10">
          <TrainInfoCard 
            train={selectedTrain} 
            onClose={() => setSelectedTrain(null)} 
          />
        </div>
      )}

      {/* Delay Legend */}
      <div className="absolute bottom-4 left-4 z-10">
        <DelayLegend />
      </div>

      {/* --- ADDED: UI Controls Wrapper --- */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        {/* Railway Overlay Toggle */}
        <button
          onClick={() => setShowRailwayOverlay(!showRailwayOverlay)}
          className={cn(
            'px-3 py-2 rounded-lg shadow-md text-sm font-medium transition-colors',
            showRailwayOverlay 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-white text-gray-700 hover:bg-gray-50'
          )}
        >
          🚂 Railway Tracks
        </button>

        {/* --- ADDED: Manual Refresh Button --- */}
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 rounded-lg shadow-md hover:bg-gray-50 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
          title="Refresh train data"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          <span className="text-sm font-medium">
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </span>
        </button>
      </div>
      
      {/* --- UPDATED: Use `isLoading` for the initial load message --- */}
      {/* This only shows on the very first load, not on background refreshes */}
      {isLoading && !trains && (
        <div className="absolute top-16 left-4 bg-white rounded-lg shadow-md p-3">
          <div className="flex items-center gap-2">
            <LoadingSpinner size="sm" />
            <span className="text-sm">Loading initial train data...</span>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Failed to load train data
        </div>
      )}
    </div>
  );
}
```

### How It Works: A Detailed Explanation

1.  **Initial Data Load:**
    *   When the `Home` page mounts, it renders `TrainMap`.
    *   `TrainMap` calls `useTrains()`.
    *   TanStack Query sees no cached data for `['trains']` and sets `isLoading` and `isFetching` to `true`.
    *   The `isLoading && !trains` condition in `TrainMap.tsx` is met, showing "Loading initial train data...".
    *   The `queryFn` is executed, calling `GET /api/trains`.
    *   Once the data returns, it's cached. `isLoading` becomes `false`, `isFetching` becomes `false`, and the `trains` variable is populated.
    *   The component re-renders, and the trains appear on the map.

2.  **Automatic 30-Second Refresh:**
    *   The `refetchInterval: 30000` option in `useTrains` tells TanStack Query to mark the data as stale after 30 seconds and trigger a background refetch.
    *   When the refetch starts, `isFetching` becomes `true` (but `isLoading` remains `false`).
    *   The manual refresh button will now show "Refreshing..." with a spinning icon. The initial loading indicator is not shown, providing a seamless user experience.
    *   When the new data arrives, the `trains` variable is updated, and the map re-renders with the new positions. `isFetching` becomes `false` again.

3.  **Manual Refresh:**
    *   The user clicks the "Refresh" button.
    *   The `onClick={() => refetch()}` handler is called. `refetch` is the function provided by TanStack Query.
    *   This immediately triggers a background refetch, just like the interval-based one.
    *   `isFetching` becomes `true`, the button enters its loading state, and the data is fetched.
    *   The `disabled={isFetching}` attribute prevents the user from clicking the button multiple times while a fetch is already in progress.

### Benefits of this Solution

*   **Robust & Declarative:** You declare your data fetching needs in the hook, and TanStack Query handles the complex lifecycle, including background updates, caching, and error handling.
*   **Efficient:** It prevents unnecessary re-renders. The component only updates when the fetched data actually changes.
*   **Clean Code:** The component remains clean and focused on rendering the UI, while the data fetching logic is neatly encapsulated in the `useTrains` hook.
*   **Excellent UX:** The user gets a clear indication of both the initial load and subsequent background refreshes, with a non-intrusive loading state for updates.
*   **No Manual Timers:** You avoid the potential pitfalls of `useEffect` with `setInterval`, such as cleanup issues or timers running when the component is unmounted.