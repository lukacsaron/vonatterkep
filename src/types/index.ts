export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Station {
  id: string;
  name: string;
  /**
   * Absent when the upstream feed does not give us a position. Do NOT substitute
   * { latitude: 0, longitude: 0 } - that is open water off West Africa and it
   * renders stations and trains in the Gulf of Guinea.
   */
  coordinates?: Coordinates;
  platforms?: string[];
  services?: string[];
}

export interface InfoService {
  fontCode: number;
  fontCharSet: string;  // e.g., "MNR2007"
  description?: string;
}

export interface Train {
  /**
   * Stable unique key for the train on the map: vonatinfo's raw @TrainNumber,
   * which still carries the operator prefix ("55142"). Not for display - old
   * `?train=` links match on it, and it cannot collide across operators.
   */
  id: string;
  /**
   * Public train number, as printed on timetables and in MÁV's own TRAIN title:
   * "142", "3144", "9094" (GYSEV), "H4004" (HÉV). Derived from `id` by
   * stripping the operator's UIC prefix; replaced by the TRAIN title's number
   * once the train's identity is known.
   */
  number: string;
  /**
   * Badge-level category. vonatinfo's positions feed has no category at all, so
   * this is only meaningful when `category` is set; without it the value is the
   * REGIONAL default, i.e. "not known yet".
   */
  type: TrainType;
  /** Operator from vonatinfo's @Menetvonal: "MAV", "GYSEV" or "HEV". */
  operator?: string;
  /**
   * Category exactly as MÁV writes it in the train's TRAIN title: "EuroCity",
   * "InterCity", "railjet", "InterRégió", "sebesvonat", "személyvonat", "HÉV".
   * Absent until the worker has fetched (or the slide-in has seen) the title.
   */
  category?: string;
  /** Line code, when the service has one: "S80", "Z72", "H5". */
  line?: string;
  /** Absent when we have no GPS fix for the train. Never fake 0,0. */
  position?: Coordinates;
  speed: number;
  heading: number;
  delay: number;  // in minutes, from real-time API
  nextStation?: Station;
  previousStation?: Station;
  origin?: Station;       // Starting station from route data
  destination?: Station;  // Final destination from route data
  route?: Stop[];
  // Enhanced fields for better popup info
  /**
   * vonatinfo ElviraID of this run, e.g. "9339647_260921" (HÉV:
   * "1578876#935_260921"). The name is a leftover from the OTP/GTFS era; it is
   * kept because the Redis hash, the API routes (/api/trains/[gtfsId]) and the
   * typed client all key on it. Unusable upstream ids come through as
   * "vonatinfo:<raw number>" so every train still has a unique key.
   */
  gtfsId?: string;
  /**
   * The train's proper name ("LISZT FERENC"), else its line code ("S80"), else
   * absent. Used to hold the "Origin - Destination" relation; that lives in
   * `origin` / `destination`.
   */
  trainName?: string;
  lastUpdate?: Date;      // When position was last updated
  isMoving?: boolean;     // Whether train is currently moving
  // UIC locomotive type detection. Only the dead OTP feed carried vehicle ids;
  // vonatinfo has none, so nothing fills these at the moment.
  locomotiveType?: import('./trainTypes').TrainType;  // Detected locomotive/EMU type
  uicInfo?: import('./trainTypes').UICParseResult;    // Raw UIC parsing result
  // EMMA API service features (not filled by vonatinfo either)
  infoServices?: InfoService[];
}

export interface TrainStop {
  id?: string;             // stop ID from EMMA API
  name: string;
  scheduledArrival?: Date;
  actualArrival?: Date;
  scheduledDeparture?: Date;
  actualDeparture?: Date;
  platform: string;
  arrivalDelay: number;    // in minutes
  departureDelay: number;  // in minutes
  isPassed: boolean;       // whether train has already passed this stop
  coordinates?: Coordinates; // GPS coordinates from EMMA API
}

export interface TrainDetails {
  destination: string;
  trainName?: string;           // Proper name, like "LISZT FERENC"
  routeShortName?: string;      // Line code, like "S80"
  routeLongName?: string;       // Full route name
  overallDelay: number;         // in minutes
  stops: TrainStop[];
  /** Number, name, category and line parsed from the same TRAIN answer. */
  identity?: import('../lib/trains/identity').TrainIdentity;
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

export interface RouteDetails {
  gtfsId: string;
  geometry: string; // The encoded polyline string from the MÁV geometry API
  stops: TrainStop[]; // The existing TrainStop[] type from the MÁV trip details API
}

export interface Stop {
  station: Station;
  arrival?: Date;
  departure?: Date;
  actualArrival?: Date;
  actualDeparture?: Date;
  platform?: string;
  delay?: number;
  isPassed?: boolean;
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
  time: Date; // Generic time, can be arrival or departure
  platform?: string;
  // For Departures, this is the destination. For Arrivals, this is the origin.
  remoteStation: Station; 
  delay: number;
  status: DepartureStatus;
  // Legacy fields for backward compatibility
  departure?: Date;
  arrival?: Date;
  destination?: Station;
}

/**
 * Badge-level train category. MÁV's full category list (InterRégió, sebesvonat,
 * zónázó, ...) is mapped onto these in src/lib/trains/identity.ts
 * (trainTypeForCategory); the precise word is kept in `Train.category`.
 * Adding a member here also needs an entry in TrainTypeBadge's typeConfig,
 * which is a Record over this enum and throws on a value it has no entry for.
 */
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
  MINOR = 'MINOR',         // 5-19 perc késés (yellow)
  MODERATE = 'MODERATE',   // 20-59 perc késés (orange)
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

// New interface for train search results
export interface TrainSearchResult {
  gtfsId: string;
  /** Public train number ("142"), same as Train.number. */
  trainNumber: string;
  trainName?: string; // e.g., "TÓPART"
  trainType: TrainType;
  origin: {
    name: string;
    time: Date;
  };
  destination: {
    name: string;
    time: Date;
  };
  durationMinutes: number;
  liveDelayMinutes?: number; // Optional: only if train is active
  isActive: boolean; // Is the train currently running and trackable?
}