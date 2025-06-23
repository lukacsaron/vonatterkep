export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Station {
  id: string;
  name: string;
  coordinates: Coordinates;
  platforms?: string[];
  services?: string[];
}

export interface Train {
  id: string;
  number: string;
  type: TrainType;
  position: Coordinates;
  speed: number;
  heading: number;
  delay: number;  // in minutes, from real-time API
  nextStation?: Station;
  previousStation?: Station;
  destination?: Station;
  route?: Stop[];
  // Enhanced fields for better popup info
  gtfsId?: string;        // For delay lookup
  trainName?: string;     // Route name like "S60"
  lastUpdate?: Date;      // When position was last updated
  isMoving?: boolean;     // Whether train is currently moving
}

export interface TrainStop {
  name: string;
  scheduledArrival?: Date;
  actualArrival?: Date;
  scheduledDeparture?: Date;
  actualDeparture?: Date;
  platform: string;
  arrivalDelay: number;    // in minutes
  departureDelay: number;  // in minutes
  isPassed: boolean;       // whether train has already passed this stop
}

export interface TrainDetails {
  destination: string;
  trainName?: string;           // Like "S60"
  routeShortName?: string;      // Like "S10"
  routeLongName?: string;       // Full route name
  overallDelay: number;         // in minutes
  stops: TrainStop[];
}

export interface EnhancedTrainDetails {
  train: Train;
  details?: TrainDetails;       // Full trip details with stops
  nextStop?: {
    name: string;
    scheduledTime?: Date;
    estimatedTime?: Date;
    platform?: string;
    delay: number;
  };
  routeProgress?: {
    currentStop: number;
    totalStops: number;
    distanceCovered?: number;
    totalDistance?: number;
  };
  status: 'moving' | 'stopped' | 'delayed' | 'on_time';
}

export interface Stop {
  station: Station;
  arrival?: Date;
  departure?: Date;
  platform?: string;
  delay?: number;
}

export interface Journey {
  id: string;
  legs: JourneyLeg[];
  duration: number;
  distance: number;
  price?: {
    amount: number;
    currency: string;
  };
  transfers: number;
}

export interface JourneyLeg {
  mode: 'train' | 'bus' | 'walk';
  origin: Station;
  destination: Station;
  departure: Date;
  arrival: Date;
  train?: Train;
  platform?: string;
}

export interface Departure {
  train: Train;
  departure: Date;
  arrival?: Date;
  platform?: string;
  destination: Station;
  delay: number;
  status: DepartureStatus;
}

export enum TrainType {
  IC = 'IC',
  EC = 'EC',
  RAILJET = 'RJ',
  REGIONAL = 'REG',
  SUBURBAN = 'S',
  NIGHT = 'EN',
}

export enum DepartureStatus {
  ON_TIME = 'ON_TIME',
  DELAYED = 'DELAYED',
  CANCELLED = 'CANCELLED',
  DEPARTED = 'DEPARTED',
}

export enum DelayCategory {
  ON_TIME = 'ON_TIME',     // 0-4 perc késés (green)
  MINOR = 'MINOR',         // 5-14 perc késés (yellow)
  MODERATE = 'MODERATE',   // 15-59 perc késés (orange)
  SEVERE = 'SEVERE',       // 60+ perc késés (red)
}

export interface User {
  id: string;
  email: string;
  name?: string;
  preferences: UserPreferences;
  favorites: Favorite[];
}

export interface UserPreferences {
  language: 'hu' | 'en' | 'de';
  theme: 'light' | 'dark' | 'system';
  notifications: {
    delays: boolean;
    journeyReminders: boolean;
  };
}

export interface Favorite {
  id: string;
  type: 'station' | 'train' | 'journey';
  referenceId: string;
  name: string;
  createdAt: Date;
}