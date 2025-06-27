import { Train, Station, Departure, TrainType, DepartureStatus, TrainSearchResult } from '../../types';
import { MavStation, MavTrain, MavDeparture, MavArrival } from './mav';

export function transformMavStation(mavStation: MavStation): Station {
  return {
    id: mavStation.UicKod,
    name: mavStation.Nev,
    coordinates: {
      latitude: mavStation.GPS?.Lat || 0,
      longitude: mavStation.GPS?.Lng || 0
    },
    platforms: [], // MÁV API doesn't provide platform info in station list
    services: [] // Would need additional API call for services
  };
}

export function transformMavTrain(mavTrain: MavTrain): Train {
  const train = {
    id: mavTrain.VonatSzam,
    number: mavTrain.VonatSzam,
    type: mapMavTrainType(mavTrain.Tipus),
    position: {
      latitude: mavTrain.UtolsoGPS?.Lat || 0,
      longitude: mavTrain.UtolsoGPS?.Lng || 0
    },
    speed: mavTrain.UtolsoGPS?.Sebesseg || 0,
    heading: mavTrain.UtolsoGPS?.Irany || 0,
    delay: mavTrain.Keses || 0,
    destination: mavTrain.Celallomas ? {
      id: 'unknown',
      name: mavTrain.Celallomas,
      coordinates: { latitude: 0, longitude: 0 }
    } : undefined,
    // Enhanced fields
    gtfsId: mavTrain.gtfsId,
    trainName: mavTrain.trainName,
    lastUpdate: mavTrain.UtolsoGPS?.Ido ? new Date(mavTrain.UtolsoGPS.Ido) : new Date(),
    isMoving: (mavTrain.UtolsoGPS?.Sebesseg || 0) > 5, // Consider moving if speed > 5 km/h
    // UIC locomotive type detection
    locomotiveType: mavTrain.locomotiveType,
    uicInfo: mavTrain.uicInfo
  };
  
  // Debug coordinate transformation
  if (mavTrain.VonatSzam && mavTrain.VonatSzam.includes('863')) {
    console.log('🔄 Transforming train 863:', {
      original: { lat: mavTrain.UtolsoGPS?.Lat, lng: mavTrain.UtolsoGPS?.Lng },
      transformed: { lat: train.position.latitude, lng: train.position.longitude },
      mapboxFormat: [train.position.longitude, train.position.latitude]
    });
  }
  
  return train;
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