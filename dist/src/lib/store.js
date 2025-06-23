"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useJourneyStore = exports.useUserStore = exports.useMapStore = void 0;
const zustand_1 = require("zustand");
exports.useMapStore = (0, zustand_1.create)((set) => ({
    selectedTrain: null,
    selectedStation: null,
    focusedTrain: null,
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
    setFocusedTrain: (train) => set({ focusedTrain: train }),
    setBounds: (bounds) => set({ bounds }),
    setZoom: (zoom) => set({ zoom }),
    setCenter: (center) => set({ center }),
    zoomToTrain: (train) => set({
        selectedTrain: train,
        focusedTrain: train,
        center: { lat: train.position.latitude, lng: train.position.longitude },
        zoom: 7
    }),
}));
exports.useUserStore = (0, zustand_1.create)((set) => ({
    user: null,
    isAuthenticated: false,
    favorites: [],
    setUser: (user) => set({ user, isAuthenticated: !!user, favorites: (user === null || user === void 0 ? void 0 : user.favorites) || [] }),
    addFavorite: (favorite) => set((state) => ({
        favorites: [
            ...state.favorites,
            Object.assign(Object.assign({}, favorite), { id: crypto.randomUUID(), createdAt: new Date() }),
        ],
    })),
    removeFavorite: (id) => set((state) => ({
        favorites: state.favorites.filter((f) => f.id !== id),
    })),
    logout: () => set({ user: null, isAuthenticated: false, favorites: [] }),
}));
exports.useJourneyStore = (0, zustand_1.create)((set) => ({
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
    swapStations: () => set((state) => ({
        origin: state.destination,
        destination: state.origin,
    })),
}));
