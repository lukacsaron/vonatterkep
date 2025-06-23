"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useStations = useStations;
exports.useStation = useStation;
exports.useDepartures = useDepartures;
const react_query_1 = require("@tanstack/react-query");
const client_1 = require("@/lib/api/client");
function useStations(search) {
    return (0, react_query_1.useQuery)({
        queryKey: ['stations', search],
        queryFn: () => client_1.api.get(search ? `/stations?search=${encodeURIComponent(search)}` : '/stations'),
        staleTime: 60 * 60 * 1000, // 1 hour
    });
}
function useStation(stationId) {
    return (0, react_query_1.useQuery)({
        queryKey: ['station', stationId],
        queryFn: () => client_1.api.get(`/stations/${stationId}`),
        enabled: !!stationId,
    });
}
function useDepartures(stationId, date) {
    const dateStr = (date === null || date === void 0 ? void 0 : date.toISOString()) || new Date().toISOString();
    return (0, react_query_1.useQuery)({
        queryKey: ['departures', stationId, dateStr],
        queryFn: () => client_1.api.get(`/stations/${stationId}/departures?date=${dateStr}`),
        enabled: !!stationId,
        refetchInterval: 60000, // 1 minute
    });
}
