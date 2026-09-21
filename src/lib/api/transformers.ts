import { Train, Station, Departure, DepartureStatus } from '../../types';
import { MavStation, MavTrain, MavDeparture, MavArrival } from './mav';
import { applyTrainIdentity, feedIdentity, parseBoardLabel, trainTypeForCategory } from '../trains/identity';

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

/**
 * One positions-feed train -> our Train. Origin and destination carry names
 * only (vonatinfo's @Relation); the worker gives them GTFS ids and coordinates.
 * Number, operator and - for HÉV - category and line are known from the feed
 * itself; everything else about the train's identity is applied later from
 * the TRAIN title (see src/lib/trains/identityEnrichment.ts).
 */
export function transformMavTrain(mavTrain: MavTrain): Train {
  const destination: Station | undefined = mavTrain.Celallomas ? { id: '', name: mavTrain.Celallomas } : undefined;
  const origin: Station | undefined = mavTrain.Kiindulas ? { id: '', name: mavTrain.Kiindulas } : undefined;
  const gps = mavTrain.UtolsoGPS;

  const train: Train = {
    id: mavTrain.VonatSzam,
    number: mavTrain.publicNumber || mavTrain.VonatSzam,
    operator: mavTrain.operator,
    type: trainTypeForCategory(undefined, undefined, mavTrain.operator),
    position: gps && (gps.Lat !== 0 || gps.Lng !== 0)
      ? { latitude: gps.Lat, longitude: gps.Lng }
      : undefined,
    speed: msToKmh(gps?.Sebesseg || 0),
    heading: gps?.Irany || 0,
    delay: mavTrain.Keses || 0,
    origin,
    destination,
    gtfsId: mavTrain.gtfsId,
    lastUpdate: gps?.Ido ? new Date(gps.Ido) : new Date(),
    isMoving: (gps?.Sebesseg || 0) > kmhToMs(5), // Consider moving if speed > 5 km/h (converted to m/s)
  };

  const known = feedIdentity(train);
  return known ? applyTrainIdentity(train, known) : train;
}

/** Board label ("TOKAJ IC", "személy", "CÍVIS") -> type, name and category of the train. */
function boardTrainIdentity(label: string): Pick<Train, 'type' | 'trainName' | 'category'> {
  const { name, category } = parseBoardLabel(label);
  return { type: trainTypeForCategory(category), trainName: name, category };
}

export function transformMavDeparture(mavDeparture: MavDeparture, station: Station): Departure {
  const departureTime = parseTimeString(mavDeparture.Indulas);
  return {
    train: {
      id: mavDeparture.VonatSzam,
      number: mavDeparture.VonatSzam,
      // Same ElviraID the live positions feed uses as gtfsId, so the station
      // page can open this train on the map.
      gtfsId: mavDeparture.elviraId,
      ...boardTrainIdentity(mavDeparture.Tipus),
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
      // Same ElviraID the live positions feed uses as gtfsId, so the station
      // page can open this train on the map.
      gtfsId: mavArrival.elviraId,
      ...boardTrainIdentity(mavArrival.Tipus),
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

/**
 * When the train actually leaves, not when it was scheduled to: comparing the
 * scheduled time marked a train running 20 minutes late as DEPARTED while it
 * was still standing at the platform.
 */
function effectiveTime(scheduledIso: string, actualIso: string | undefined, delayMinutes: number): Date {
  if (actualIso) {
    const actual = new Date(actualIso);
    if (!isNaN(actual.getTime())) return actual;
  }
  return new Date(parseTimeString(scheduledIso).getTime() + delayMinutes * 60000);
}

function getDepartureStatus(mavDeparture: MavDeparture): DepartureStatus {
  const delay = mavDeparture.Keses || 0;
  const now = new Date();
  const departureTime = effectiveTime(mavDeparture.Indulas, mavDeparture.actualTime, delay);
  
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
  const arrivalTime = effectiveTime(mavArrival.Erkezes, mavArrival.actualTime, delay);
  
  if (arrivalTime < now) {
    return DepartureStatus.DEPARTED; // Use DEPARTED to indicate "ARRIVED"
  }
  
  if (delay >= 20) {
    return DepartureStatus.DELAYED;
  }
  
  return DepartureStatus.ON_TIME;
}