import { create } from 'zustand';
import { Train, Station, Journey, User, Favorite } from '@/types';

interface MapState {
  selectedTrain: Train | null;
  selectedStation: Station | null;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  zoom: number;
  center: { lat: number; lng: number };
  setSelectedTrain: (train: Train | null) => void;
  setSelectedStation: (station: Station | null) => void;
  setBounds: (bounds: MapState['bounds']) => void;
  setZoom: (zoom: number) => void;
  setCenter: (center: MapState['center']) => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedTrain: null,
  selectedStation: null,
  bounds: {
    north: 48.7,
    south: 45.5,
    east: 22.8,
    west: 16.1,
  },
  zoom: 7,
  center: { lat: 47.1625, lng: 19.5033 }, // Budapest
  setSelectedTrain: (train) => set({ selectedTrain: train }),
  setSelectedStation: (station) => set({ selectedStation: station }),
  setBounds: (bounds) => set({ bounds }),
  setZoom: (zoom) => set({ zoom }),
  setCenter: (center) => set({ center }),
}));

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  favorites: Favorite[];
  setUser: (user: User | null) => void;
  addFavorite: (favorite: Omit<Favorite, 'id' | 'createdAt'>) => void;
  removeFavorite: (id: string) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isAuthenticated: false,
  favorites: [],
  setUser: (user) => set({ user, isAuthenticated: !!user, favorites: user?.favorites || [] }),
  addFavorite: (favorite) =>
    set((state) => ({
      favorites: [
        ...state.favorites,
        {
          ...favorite,
          id: crypto.randomUUID(),
          createdAt: new Date(),
        },
      ],
    })),
  removeFavorite: (id) =>
    set((state) => ({
      favorites: state.favorites.filter((f) => f.id !== id),
    })),
  logout: () => set({ user: null, isAuthenticated: false, favorites: [] }),
}));

interface JourneyState {
  origin: Station | null;
  destination: Station | null;
  departureTime: Date;
  journeys: Journey[];
  selectedJourney: Journey | null;
  isLoading: boolean;
  setOrigin: (station: Station | null) => void;
  setDestination: (station: Station | null) => void;
  setDepartureTime: (time: Date) => void;
  setJourneys: (journeys: Journey[]) => void;
  setSelectedJourney: (journey: Journey | null) => void;
  setIsLoading: (loading: boolean) => void;
  swapStations: () => void;
}

export const useJourneyStore = create<JourneyState>((set) => ({
  origin: null,
  destination: null,
  departureTime: new Date(),
  journeys: [],
  selectedJourney: null,
  isLoading: false,
  setOrigin: (station) => set({ origin: station }),
  setDestination: (station) => set({ destination: station }),
  setDepartureTime: (time) => set({ departureTime: time }),
  setJourneys: (journeys) => set({ journeys }),
  setSelectedJourney: (journey) => set({ selectedJourney: journey }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  swapStations: () =>
    set((state) => ({
      origin: state.destination,
      destination: state.origin,
    })),
}));