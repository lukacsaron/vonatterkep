/**
 * UIC Train Type Detection System
 * 
 * This system parses UIC vehicle identification codes to detect Hungarian
 * locomotive and EMU types, providing passengers with comfort and reliability information.
 */

export enum TrainCategory {
  LOCOMOTIVE = 'locomotive',  // Pulls passenger cars
  EMU = 'emu',               // Electric Multiple Unit
  DMU = 'dmu',               // Diesel Multiple Unit  
  RAILCAR = 'railcar'        // Single unit
}

export enum PropulsionType {
  STEAM = 'steam',
  ELECTRIC = 'electric',
  DIESEL = 'diesel',
  HYBRID = 'hybrid'
}

export enum ComfortLevel {
  VINTAGE = 'vintage',       // Historic, basic comfort
  BASIC = 'basic',           // Old but functional
  STANDARD = 'standard',     // Average modern comfort
  MODERN = 'modern',         // Good comfort with AC
  PREMIUM = 'premium'        // Latest tech, excellent comfort
}

export interface TrainType {
  uicCode: string;           // "0431", "1415", etc.
  name: string;              // "V43 1000", "FLIRT"
  fullName: string;          // "V43 1000 series electric locomotive"
  manufacturer: string;      // "Ganz-MÁVAG", "Stadler"
  category: TrainCategory;
  propulsion: PropulsionType;
  hasAirConditioning: boolean;
  comfortLevel: ComfortLevel;
  reliabilityRating: number; // 1-5 stars
  maxSpeed: number;          // km/h
  yearIntroduced: number;
  modernized?: number;       // Year of major overhaul
  features: string[];        // ["Tilting", "WiFi", "Power outlets"]
  nickname?: string;         // "Fecske", "Papagáj", "Cirmos"
  operationalNotes?: string; // "Often used on IC services"
}

export interface UICParseResult {
  vehicleType: 'locomotive' | 'emu' | 'dmu' | 'unknown';
  propulsion: PropulsionType | null;
  countryCode: string;
  typeCode: string;
  trainType?: TrainType;
  confidence: number; // 0-1 how confident we are in the detection
  rawUIC: string;
}

// Enhanced train interface that includes detected locomotive type
export interface EnhancedTrain {
  // ... existing train properties
  locomotiveType?: TrainType;
  uicInfo?: UICParseResult;
}