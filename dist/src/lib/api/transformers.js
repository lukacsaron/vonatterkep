"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformMavStation = transformMavStation;
exports.transformMavTrain = transformMavTrain;
exports.transformMavDeparture = transformMavDeparture;
exports.transformMavArrival = transformMavArrival;
exports.transformSearchResult = transformSearchResult;
const types_1 = require("../../types");
function transformMavStation(mavStation) {
    var _a, _b;
    return {
        id: mavStation.UicKod,
        name: mavStation.Nev,
        coordinates: {
            latitude: ((_a = mavStation.GPS) === null || _a === void 0 ? void 0 : _a.Lat) || 0,
            longitude: ((_b = mavStation.GPS) === null || _b === void 0 ? void 0 : _b.Lng) || 0
        },
        platforms: [], // MÁV API doesn't provide platform info in station list
        services: [] // Would need additional API call for services
    };
}
function transformMavTrain(mavTrain) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const train = {
        id: mavTrain.VonatSzam,
        number: mavTrain.VonatSzam,
        type: mapMavTrainType(mavTrain.Tipus),
        position: {
            latitude: ((_a = mavTrain.UtolsoGPS) === null || _a === void 0 ? void 0 : _a.Lat) || 0,
            longitude: ((_b = mavTrain.UtolsoGPS) === null || _b === void 0 ? void 0 : _b.Lng) || 0
        },
        speed: ((_c = mavTrain.UtolsoGPS) === null || _c === void 0 ? void 0 : _c.Sebesseg) || 0,
        heading: ((_d = mavTrain.UtolsoGPS) === null || _d === void 0 ? void 0 : _d.Irany) || 0,
        delay: mavTrain.Keses || 0,
        destination: mavTrain.Celallomas ? {
            id: 'unknown',
            name: mavTrain.Celallomas,
            coordinates: { latitude: 0, longitude: 0 }
        } : undefined,
        // Enhanced fields
        gtfsId: mavTrain.gtfsId,
        trainName: mavTrain.trainName,
        lastUpdate: ((_e = mavTrain.UtolsoGPS) === null || _e === void 0 ? void 0 : _e.Ido) ? new Date(mavTrain.UtolsoGPS.Ido) : new Date(),
        isMoving: (((_f = mavTrain.UtolsoGPS) === null || _f === void 0 ? void 0 : _f.Sebesseg) || 0) > 5, // Consider moving if speed > 5 km/h
        // UIC locomotive type detection
        locomotiveType: mavTrain.locomotiveType,
        uicInfo: mavTrain.uicInfo
    };
    // Debug coordinate transformation
    if (mavTrain.VonatSzam && mavTrain.VonatSzam.includes('863')) {
        console.log('🔄 Transforming train 863:', {
            original: { lat: (_g = mavTrain.UtolsoGPS) === null || _g === void 0 ? void 0 : _g.Lat, lng: (_h = mavTrain.UtolsoGPS) === null || _h === void 0 ? void 0 : _h.Lng },
            transformed: { lat: train.position.latitude, lng: train.position.longitude },
            mapboxFormat: [train.position.longitude, train.position.latitude]
        });
    }
    return train;
}
function transformMavDeparture(mavDeparture, station) {
    const departureTime = parseTimeString(mavDeparture.Indulas);
    return {
        train: {
            id: mavDeparture.VonatSzam,
            number: mavDeparture.VonatSzam,
            type: mapMavTrainType(mavDeparture.Tipus),
            position: station.coordinates,
            speed: 0,
            heading: 0,
            delay: mavDeparture.Keses || 0
        },
        time: departureTime,
        platform: mavDeparture.Vagany,
        remoteStation: {
            id: 'unknown',
            name: mavDeparture.Celallomas,
            coordinates: { latitude: 0, longitude: 0 }
        },
        delay: mavDeparture.Keses || 0,
        status: getDepartureStatus(mavDeparture),
        // Legacy fields for backward compatibility
        departure: departureTime,
        destination: {
            id: 'unknown',
            name: mavDeparture.Celallomas,
            coordinates: { latitude: 0, longitude: 0 }
        }
    };
}
function transformMavArrival(mavArrival, station) {
    const arrivalTime = parseTimeString(mavArrival.Erkezes);
    return {
        train: {
            id: mavArrival.VonatSzam,
            number: mavArrival.VonatSzam,
            type: mapMavTrainType(mavArrival.Tipus),
            position: station.coordinates,
            speed: 0,
            heading: 0,
            delay: mavArrival.Keses || 0
        },
        time: arrivalTime,
        platform: mavArrival.Vagany,
        remoteStation: {
            id: 'unknown',
            name: mavArrival.Kiindulas,
            coordinates: { latitude: 0, longitude: 0 }
        },
        delay: mavArrival.Keses || 0,
        status: getArrivalStatus(mavArrival),
        // Legacy fields for backward compatibility
        arrival: arrivalTime
    };
}
function transformSearchResult(searchResult, stationMap) {
    var _a, _b, _c;
    const departure = searchResult.train;
    const details = searchResult.details;
    // Calculate duration if we have route details
    let durationMinutes = 0;
    let originTime = new Date();
    let destinationTime = new Date();
    if (details && details.stops && details.stops.length > 0) {
        const firstStop = details.stops[0];
        const lastStop = details.stops[details.stops.length - 1];
        originTime = firstStop.scheduledDeparture || firstStop.scheduledArrival || new Date();
        destinationTime = lastStop.scheduledArrival || lastStop.scheduledDeparture || new Date();
        durationMinutes = Math.round((destinationTime.getTime() - originTime.getTime()) / (1000 * 60));
    }
    else {
        // Fallback: use the departure time from the search result
        originTime = parseTimeString(departure.Indulas);
        destinationTime = new Date(originTime.getTime() + 2 * 60 * 60 * 1000); // Assume 2 hours
        durationMinutes = 120;
    }
    return {
        gtfsId: (details === null || details === void 0 ? void 0 : details.gtfsId) || `${departure.VonatSzam}_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_1`,
        trainNumber: departure.VonatSzam,
        trainName: details === null || details === void 0 ? void 0 : details.trainName,
        trainType: mapMavTrainType(departure.Tipus),
        origin: {
            name: searchResult.fromStation === 'search'
                ? (((_b = (_a = details === null || details === void 0 ? void 0 : details.stops) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown')
                : (((_c = stationMap === null || stationMap === void 0 ? void 0 : stationMap.get(searchResult.fromStation)) === null || _c === void 0 ? void 0 : _c.name) || searchResult.fromStation),
            time: originTime
        },
        destination: {
            name: departure.Celallomas,
            time: destinationTime
        },
        durationMinutes,
        liveDelayMinutes: departure.Keses > 0 ? departure.Keses : undefined,
        isActive: details ? true : false // If we have details, the train is active
    };
}
function mapMavTrainType(mavType) {
    switch (mavType.toUpperCase()) {
        case 'IC':
            return types_1.TrainType.IC;
        case 'EC':
            return types_1.TrainType.EC;
        case 'RJ':
            return types_1.TrainType.RAILJET;
        case 'S':
            return types_1.TrainType.SUBURBAN;
        case 'EN':
            return types_1.TrainType.NIGHT;
        default:
            return types_1.TrainType.REGIONAL;
    }
}
function parseTimeString(timeStr) {
    // Handle various MÁV time formats
    // e.g., "14:30", "2024.12.23 14:30", timestamp
    const now = new Date();
    if (timeStr.includes(':')) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const date = new Date(now);
        date.setHours(hours, minutes, 0, 0);
        return date;
    }
    // Try parsing as timestamp
    const timestamp = parseInt(timeStr);
    if (!isNaN(timestamp)) {
        return new Date(timestamp * 1000); // Convert seconds to milliseconds
    }
    // Fallback to current time
    return now;
}
function getDepartureStatus(mavDeparture) {
    const delay = mavDeparture.Keses || 0;
    const now = new Date();
    const departureTime = parseTimeString(mavDeparture.Indulas);
    if (departureTime < now) {
        return types_1.DepartureStatus.DEPARTED;
    }
    if (delay >= 20) {
        return types_1.DepartureStatus.DELAYED;
    }
    return types_1.DepartureStatus.ON_TIME;
}
function getArrivalStatus(mavArrival) {
    const delay = mavArrival.Keses || 0;
    const now = new Date();
    const arrivalTime = parseTimeString(mavArrival.Erkezes);
    if (arrivalTime < now) {
        return types_1.DepartureStatus.DEPARTED; // Use DEPARTED to indicate "ARRIVED"
    }
    if (delay >= 20) {
        return types_1.DepartureStatus.DELAYED;
    }
    return types_1.DepartureStatus.ON_TIME;
}
