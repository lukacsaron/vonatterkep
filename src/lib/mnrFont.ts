/**
 * MNR2007 Font Character Mapping for Hungarian Railway Icons
 * 
 * Based on the MNR2007 font used by MÁV EMMA and holavonat.app
 * Maps UIC codes to specific font characters that represent train types
 */

export interface MNRMapping {
  character: string;
  description: string;
  trainTypes: string[];
}

// MNR2007 font character mappings for Hungarian trains
export const MNR_FONT_MAPPING: Record<string, string> = {
  // Electric Locomotives
  "0431": "ǝ", // V43 1000 series
  "0432": "ȭ", // V43 2000 series (Fecske/Papagáj)
  "0433": "Õ", // V43 3000 series (Cirmos)
  "0460": "œ", // V46 series
  "0630": "ß", // V63 series
  "0470": "ń", // Siemens EuroSprinter
  "0480": "Þ", // Bombardier Traxx
  "0471": "ń", // Siemens Vectron GYSEV
  "6182": "ń", // Siemens EuroSprinter Akiem
  
  // Diesel Locomotives  
  "0288": "Ė", // M28 series
  "0319": "ė", // M31 series
  "0408": "Ę", // M40 series
  "0418": "ę", // M41 series
  "0438": "Ě", // M43 series
  "0448": "ě", // M44 series
  "0478": "Ĕ", // M47 series
  "0618": "ĕ", // M61 series
  "0628": "Ē", // M62 series
  "0638": "ē", // M63 series
  "2232": "Ĝ", // M32 series
  "0490": "ĝ", // Alstom Astride
  "0001": "Ğ", // Henschel Viking
  
  // Electric Multiple Units (EMUs)
  "1415": "ğ", // Stadler FLIRT
  "1435": "Ġ", // Stadler FLIRT3 GYSEV
  "1815": "ġ", // Stadler KISS
  "1425": "Ģ", // Bombardier Talent
  "1426": "ģ", // Siemens Desiro
  "1406": "Ĥ", // Stadler CityLink
  
  // Diesel Multiple Units (DMUs)
  "0117": "ĥ", // Bzmot (small red)
  "0127": "Ħ", // Bzmot IP
  "1136": "ħ", // Bzmot twin
  "1416": "Ĩ", // Metrovagonmas Bpmot
  "1446": "ĩ", // Jenbacher J3998 GYSEV
  "1247": "Ī", // Jenbacher solo
  "0414": "ī", // BDVmot
  "0424": "Ĭ", // BVhmot
  "0434": "ĭ", // BVmot
  
  // Special/Other
  "1488": "Į", // VF (Villamos fűtőgép)
};

// Reverse mapping for quick lookups
export const CHARACTER_TO_UIC: Record<string, string> = Object.fromEntries(
  Object.entries(MNR_FONT_MAPPING).map(([uic, char]) => [char, uic])
);

/**
 * Get MNR2007 font character for a given UIC code
 */
export function getMNRCharacter(uicCode: string): string | null {
  return MNR_FONT_MAPPING[uicCode] || null;
}

/**
 * Get UIC code from MNR2007 font character
 */
export function getUICFromCharacter(character: string): string | null {
  return CHARACTER_TO_UIC[character] || null;
}

/**
 * Check if a UIC code has an MNR2007 font character
 */
export function hasTrainIcon(uicCode: string): boolean {
  return uicCode in MNR_FONT_MAPPING;
}

/**
 * Get all supported UIC codes that have icons
 */
export function getSupportedUICCodes(): string[] {
  return Object.keys(MNR_FONT_MAPPING);
}

/**
 * MNR2007 Service/Feature Font Codes from EMMA API
 * These appear in trip.infoServices[].fontCode
 */
export const MNR_SERVICE_CODES: Record<number, string> = {
  // Service icons from EMMA API
  197: String.fromCharCode(197),  // Seat Reservation compulsory
  200: String.fromCharCode(200),  // Domestic travel without reservation
  203: String.fromCharCode(203),  // Sleeping compartments (1st/2nd class)
  204: String.fromCharCode(204),  // Couchette (4/6 bed)
  222: String.fromCharCode(222),  // Second Class
  249: String.fromCharCode(249),  // BudapestPass accepted
  336: String.fromCharCode(336),  // Bike transport
  339: String.fromCharCode(339),  // Long distance train
  406: String.fromCharCode(406),  // International ticket required
  557: String.fromCharCode(557),  // HungaryPass accepted
  168: String.fromCharCode(168),  // Train does not wait for connection
};

/**
 * Service descriptions for tooltips
 */
export const SERVICE_DESCRIPTIONS: Record<number, string> = {
  197: "Kötelező helyjeggyel",
  200: "Belföldi utazás helyjegy nélkül",
  203: "Hálókocsi",
  204: "Fekvőhely",
  222: "Másodosztály",
  249: "BudapestPass elfogadva",
  336: "Kerékpárszállítás",
  339: "Távolsági vonat",
  406: "Nemzetközi jegy szükséges",
  557: "HungaryPass elfogadva",
  168: "Nem vár csatlakozásra",
};

/**
 * Get MNR2007 service character for fontCode
 */
export function getMNRServiceCharacter(fontCode: number): string | null {
  return MNR_SERVICE_CODES[fontCode] || null;
}

/**
 * Get service description for fontCode
 */
export function getServiceDescription(fontCode: number): string | null {
  return SERVICE_DESCRIPTIONS[fontCode] || null;
}

/**
 * Train type descriptions for tooltips
 */
export const TRAIN_TYPE_DESCRIPTIONS: Record<string, string> = {
  "0431": "V43 1000 sorozat villanymozgony",
  "0432": "V43 2000 sorozat villanymozgony (Fecske/Papagáj)",
  "0433": "V43 3000 sorozat villanymozgony (Cirmos)",
  "0460": "V46 sorozat villanymozgony",
  "0630": "V63 sorozat villanymozgony",
  "0470": "Siemens EuroSprinter villanymozgony",
  "0480": "Bombardier Traxx villanymozgony",
  "0471": "Siemens Vectron GYSEV",
  "6182": "Siemens EuroSprinter Akiem",
  
  "1415": "Stadler FLIRT villamos motorvonat",
  "1435": "Stadler FLIRT3 GYSEV",
  "1815": "Stadler KISS villamos motorvonat",
  "1425": "Bombardier Talent billentőszekrényes motorvonat",
  "1426": "Siemens Desiro villamos motorvonat",
  "1406": "Stadler CityLink villamos motorvonat",
  
  "0117": "Bzmot dízel motorvonat (kispiros)",
  "0127": "Bzmot IP dízel motorvonat",
  "1136": "Bzmot iker dízel motorvonat",
  "1416": "Metrovagonmas Bpmot dízel motorvonat",
  "1446": "Jenbacher J3998 GYSEV",
  "1247": "Jenbacher szóló",
};