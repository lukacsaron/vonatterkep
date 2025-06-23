import { Train, Station, Departure, TrainType, DepartureStatus } from '@/types';
import { MavStation, MavTrain, MavDeparture } from './mav';

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
    isMoving: (mavTrain.UtolsoGPS?.Sebesseg || 0) > 5 // Consider moving if speed > 5 km/h
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
    departure: parseTimeString(mavDeparture.Indulas),
    platform: mavDeparture.Vagany,
    destination: {
      id: 'unknown',
      name: mavDeparture.Celallomas,
      coordinates: { latitude: 0, longitude: 0 }
    },
    delay: mavDeparture.Keses || 0,
    status: getDepartureStatus(mavDeparture)
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
  
  if (delay > 30) {
    return DepartureStatus.DELAYED;
  }
  
  return DepartureStatus.ON_TIME;
}