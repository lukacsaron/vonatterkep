"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTrainSearch = useTrainSearch;
const react_1 = require("react");
const useTrains_1 = require("./useTrains");
function useTrainSearch(query) {
    const { data: trains, isLoading } = (0, useTrains_1.useTrains)();
    const [debouncedQuery, setDebouncedQuery] = (0, react_1.useState)('');
    // Debounce query to avoid excessive filtering
    (0, react_1.useEffect)(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query.trim().toLowerCase());
        }, 150);
        return () => clearTimeout(timer);
    }, [query]);
    const results = (0, react_1.useMemo)(() => {
        if (!debouncedQuery || !trains || trains.length === 0) {
            return [];
        }
        const searchResults = [];
        trains.forEach(train => {
            var _a, _b, _c, _d;
            const relevanceScores = [];
            // 1. Train number matching (highest priority)
            const trainNumber = train.number.toLowerCase();
            if (trainNumber.includes(debouncedQuery)) {
                const exactMatch = trainNumber === debouncedQuery ? 100 : 90;
                const startsWithMatch = trainNumber.startsWith(debouncedQuery) ? 85 : 70;
                relevanceScores.push({
                    score: trainNumber === debouncedQuery ? exactMatch : startsWithMatch,
                    type: 'train',
                    matchedText: `Train ${train.number}`
                });
            }
            // 2. Train name matching (if available)
            if (train.trainName) {
                const trainName = train.trainName.toLowerCase();
                if (trainName.includes(debouncedQuery)) {
                    relevanceScores.push({
                        score: trainName === debouncedQuery ? 95 : 80,
                        type: 'train',
                        matchedText: `${train.trainName} (${train.number})`
                    });
                }
            }
            // 3. Destination matching
            if ((_a = train.destination) === null || _a === void 0 ? void 0 : _a.name) {
                const destination = train.destination.name.toLowerCase();
                if (destination.includes(debouncedQuery)) {
                    relevanceScores.push({
                        score: 60,
                        type: 'route',
                        matchedText: `To ${train.destination.name}`,
                        route: {
                            from: 'Current location',
                            to: train.destination.name
                        }
                    });
                }
            }
            // 4. Route search (if train has route data)
            if (train.route && train.route.length > 0) {
                const routeStations = train.route.map(stop => stop.station.name.toLowerCase());
                const matchingStations = routeStations.filter(station => station.includes(debouncedQuery));
                if (matchingStations.length > 0) {
                    const firstStation = ((_b = train.route[0]) === null || _b === void 0 ? void 0 : _b.station.name) || '';
                    const lastStation = ((_c = train.route[train.route.length - 1]) === null || _c === void 0 ? void 0 : _c.station.name) || ((_d = train.destination) === null || _d === void 0 ? void 0 : _d.name) || '';
                    relevanceScores.push({
                        score: 55,
                        type: 'route',
                        matchedText: `${firstStation} → ${lastStation}`,
                        route: {
                            from: firstStation,
                            to: lastStation
                        }
                    });
                }
            }
            // Add the best match for this train
            if (relevanceScores.length > 0) {
                const bestMatch = relevanceScores.reduce((best, current) => current.score > best.score ? current : best);
                searchResults.push({
                    type: bestMatch.type,
                    train,
                    relevance: bestMatch.score,
                    matchedText: bestMatch.matchedText,
                    route: bestMatch.route
                });
            }
        });
        // Sort by relevance (highest first) and limit to 10 results
        return searchResults
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, 10);
    }, [debouncedQuery, trains]);
    return {
        results,
        isLoading,
        hasQuery: debouncedQuery.length > 0
    };
}
