"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTrains = useTrains;
exports.useTrain = useTrain;
exports.useTimetable = useTimetable;
exports.useTrainSearch = useTrainSearch;
exports.useFeaturedTrains = useFeaturedTrains;
const react_query_1 = require("@tanstack/react-query");
const client_1 = require("@/lib/api/client");
function useTrains() {
    // We will return the entire result of useQuery to get access to refetch and isFetching
    return (0, react_query_1.useQuery)({
        queryKey: ['trains'],
        queryFn: () => client_1.api.get('/trains'),
        // --- KEY CHANGES ---
        // 1. Fetch data every 30 seconds. This was already correctly configured.
        refetchInterval: 30000,
        // 2. Data is considered stale after 15 seconds, prompting a refresh sooner on window focus.
        staleTime: 15000,
        // 3. Keep refetching on window focus to get the latest data when the user returns.
        refetchOnWindowFocus: true,
    });
}
function useTrain(trainId) {
    return (0, react_query_1.useQuery)({
        queryKey: ['train', trainId],
        queryFn: () => client_1.api.get(`/trains/${trainId}`),
        enabled: !!trainId,
        refetchInterval: 10000, // 10 seconds
    });
}
function useTimetable(stationId, type, date) {
    const dateParam = date ? date.toISOString() : undefined;
    return (0, react_query_1.useQuery)({
        queryKey: ['timetable', stationId, type, dateParam],
        queryFn: () => {
            const params = new URLSearchParams(Object.assign({ type }, (dateParam && { date: dateParam })));
            return client_1.api.get(`/stations/${stationId}/timetable?${params}`);
        },
        enabled: !!stationId,
        refetchInterval: 30000, // 30 seconds for real-time updates
        staleTime: 15000, // 15 seconds
        refetchOnWindowFocus: true,
        refetchOnMount: true,
    });
}
function useTrainSearch(params) {
    const searchParams = new URLSearchParams();
    if (params.q)
        searchParams.set('q', params.q);
    if (params.fromStationId)
        searchParams.set('fromStationId', params.fromStationId);
    if (params.toStationId)
        searchParams.set('toStationId', params.toStationId);
    if (params.date)
        searchParams.set('date', params.date.toISOString().split('T')[0]); // YYYY-MM-DD format
    const queryKey = ['trains', 'search', params];
    const queryString = searchParams.toString();
    return (0, react_query_1.useQuery)({
        queryKey,
        queryFn: () => client_1.api.get(`/trains/search?${queryString}`),
        enabled: !!(params.q || params.fromStationId || params.toStationId), // Only fetch if we have search criteria
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });
}
function useFeaturedTrains() {
    return (0, react_query_1.useQuery)({
        queryKey: ['trains', 'featured'],
        queryFn: () => client_1.api.get('/trains/search?featured=true'),
        staleTime: 10 * 60 * 1000, // 10 minutes - featured trains don't change often
        refetchOnWindowFocus: false,
    });
}
