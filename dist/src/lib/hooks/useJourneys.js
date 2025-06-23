"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useJourneySearch = useJourneySearch;
exports.useJourney = useJourney;
const react_query_1 = require("@tanstack/react-query");
const client_1 = require("@/lib/api/client");
const store_1 = require("@/lib/store");
function useJourneySearch() {
    const { origin, destination, departureTime } = (0, store_1.useJourneyStore)();
    return (0, react_query_1.useQuery)({
        queryKey: ['journeys', origin === null || origin === void 0 ? void 0 : origin.id, destination === null || destination === void 0 ? void 0 : destination.id, departureTime.toISOString()],
        queryFn: () => client_1.api.post('/journeys/search', {
            originId: origin === null || origin === void 0 ? void 0 : origin.id,
            destinationId: destination === null || destination === void 0 ? void 0 : destination.id,
            departureTime: departureTime.toISOString(),
        }),
        enabled: !!(origin && destination),
    });
}
function useJourney(journeyId) {
    return (0, react_query_1.useQuery)({
        queryKey: ['journey', journeyId],
        queryFn: () => client_1.api.get(`/journeys/${journeyId}`),
        enabled: !!journeyId,
    });
}
