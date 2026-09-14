import { Train, Station, Departure, TrainType, DepartureStatus, TrainSearchResult, TrainDetails, TrainStop } from '../../types';
import { MavStation, MavTrain, MavDeparture, MavArrival } from './mav';

// Speed conversion utilities
function msToKmh(speedMs: number): number {
  return speedMs * 3.6;
}

function kmhToMs(speedKmh: number): number {
  return speedKmh / 3.6;
}

export function transformMavStation(mavStation: MavStation): Station {
  const gps = mavStation.GPS;
  // A station with no position is listed without coordinates rather than pinned
  // at 0,0 - see the Station type.
  const coordinates = gps && (gps.Lat !== 0 || gps.Lng !== 0)
    ? { latitude: gps.Lat, longitude: gps.Lng }
    : undefined;

  return {
    id: mavStation.UicKod,
    name: mavStation.Nev,
    coordinates,
    platforms: mavStation.Vaganyok ?? [],
    services: [] // Would need additional API call for services
  };
}

export function transformMavTrain(mavTrain: MavTrain, trainDetails?: TrainDetails): Train {
  // Origin and destination come from the trip's stop list when we have it. The
  // OTP stops carry real ids and coordinates, so use them - the previous version
  // hardcoded a placeholder id and 0,0 coordinates for every single train.
  let origin: Station | undefined;
  let destination: Station | undefined;

  const stops = trainDetails?.stops;

  if (stops && stops.length > 0) {
    origin = stationFromStop(stops[0]);
    destination = stationFromStop(stops[stops.length - 1]);
  } else if (mavTrain.Celallomas && mavTrain.Celallomas !== 'Unknown') {
    // Only a headsign string is available: keep the name, but do not invent an
    // id or a position for it.
    destination = { id: '', name: mavTrain.Celallomas };
  }

  const gps = mavTrain.UtolsoGPS;

  const train: Train = {
    id: mavTrain.VonatSzam,
    number: mavTrain.VonatSzam,
    type: mapMavTrainType(mavTrain.Tipus),
    position: gps && (gps.Lat !== 0 || gps.Lng !== 0)
      ? { latitude: gps.Lat, longitude: gps.Lng }
      : undefined,
    speed: msToKmh(gps?.Sebesseg || 0),
    heading: gps?.Irany || 0,
    delay: mavTrain.Keses || 0,
    origin,
    destination,
    // Enhanced fields
    gtfsId: mavTrain.gtfsId,
    trainName: mavTrain.trainName || trainDetails?.trainName,
    lastUpdate: gps?.Ido ? new Date(gps.Ido) : new Date(),
    isMoving: (gps?.Sebesseg || 0) > kmhToMs(5), // Consider moving if speed > 5 km/h (converted to m/s)
    // UIC locomotive type detection
    locomotiveType: mavTrain.locomotiveType,
    uicInfo: mavTrain.uicInfo
  };

  return train;
}

/** Build a Station from a trip stop, keeping coordinates only when they are real. */
function stationFromStop(stop: TrainStop): Station {
  const coords = stop.coordinates;
  const hasRealCoords = !!coords
    && typeof coords.latitude === 'number'
    && typeof coords.longitude === 'number'
    && !(coords.latitude === 0 && coords.longitude === 0);

  return {
    id: stop.id || '',
    name: stop.name,
    coordinates: hasRealCoords ? coords : undefined,
    platforms: stop.platform ? [stop.platform] : undefined
  };
}

export function transformMavDeparture(mavDeparture: MavDeparture, station: Station): Departure {
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
      id: '',
      name: mavDeparture.Celallomas
    },
    delay: mavDeparture.Keses || 0,
    status: getDepartureStatus(mavDeparture),
    // Legacy fields for backward compatibility
    departure: departureTime,
    destination: {
      id: '',
      name: mavDeparture.Celallomas
    }
  };
}

export function transformMavArrival(mavArrival: MavArrival, station: Station): Departure {
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
      id: '',
      name: mavArrival.Kiindulas
    },
    delay: mavArrival.Keses || 0,
    status: getArrivalStatus(mavArrival),
    // Legacy fields for backward compatibility
    arrival: arrivalTime
  };
}

export function transformSearchResult(
  searchResult: { train: MavDeparture; fromStation: string; details?: any },
  stationMap?: Map<string, Station>
): TrainSearchResult {
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
  } else {
    // Fallback: use the departure time from the search result
    originTime = parseTimeString(departure.Indulas);
    destinationTime = new Date(originTime.getTime() + 2 * 60 * 60 * 1000); // Assume 2 hours
    durationMinutes = 120;
  }
  
  return {
    gtfsId: details?.gtfsId || `${departure.VonatSzam}_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_1`,
    trainNumber: departure.VonatSzam,
    trainName: details?.trainName,
    trainType: mapMavTrainType(departure.Tipus),
    origin: {
      name: searchResult.fromStation === 'search' 
        ? (details?.stops?.[0]?.name || 'Unknown')
        : (stationMap?.get(searchResult.fromStation)?.name || searchResult.fromStation),
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

function mapMavTrainType(mavType: string): TrainType {
  switch (mavType.toUpperCase()) {
    case 'IC':
      return TrainType.IC;
    case 'EC':
      return TrainType.EC;
    case 'RJ':
      return TrainType.RAILJET;
    case 'S':
      return TrainType.SUBURBAN;
    case 'EN':
      return TrainType.NIGHT;
    default:
      return TrainType.REGIONAL;
  }
}

function parseTimeString(timeStr: string): Date {
  // Handle various MÁV time formats
  // e.g., "14:30", "2024.12.23 14:30", timestamp
  const now = new Date();

  // A full ISO instant carries its own date - parse it as-is. Checking this
  // first matters because an ISO string also contains ':' and would otherwise
  // fall into the HH:MM branch below and lose its date.
  if (/^\d{4}-\d{2}-\d{2}T/.test(timeStr)) {
    const parsed = new Date(timeStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }

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

function getDepartureStatus(mavDeparture: MavDeparture): DepartureStatus {
  const delay = mavDeparture.Keses || 0;
  const now = new Date();
  const departureTime = parseTimeString(mavDeparture.Indulas);
  
  if (departureTime < now) {
    return DepartureStatus.DEPARTED;
  }
  
  if (delay >= 20) {
    return DepartureStatus.DELAYED;
  }
  
  return DepartureStatus.ON_TIME;
}

function getArrivalStatus(mavArrival: MavArrival): DepartureStatus {
  const delay = mavArrival.Keses || 0;
  const now = new Date();
  const arrivalTime = parseTimeString(mavArrival.Erkezes);
  
  if (arrivalTime < now) {
    return DepartureStatus.DEPARTED; // Use DEPARTED to indicate "ARRIVED"
  }
  
  if (delay >= 20) {
    return DepartureStatus.DELAYED;
  }
  
  return DepartureStatus.ON_TIME;
}