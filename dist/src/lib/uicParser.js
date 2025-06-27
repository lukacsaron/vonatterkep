"use strict";
/**
 * UIC Vehicle Code Parser
 *
 * Parses UIC vehicle identification codes to detect Hungarian locomotive and EMU types.
 * Handles EMMA API format: "1:915504310018" -> "915504310018"
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUIC = parseUIC;
exports.getTrainDescription = getTrainDescription;
exports.getComfortDescription = getComfortDescription;
exports.getTrainTypeEmoji = getTrainTypeEmoji;
exports.getReliabilityStars = getReliabilityStars;
const trainTypes_1 = require("@/types/trainTypes");
const trainDatabase_1 = require("./trainDatabase");
/**
 * Parse UIC vehicle code from EMMA API vehicle ID
 *
 * UIC Structure:
 * - Positions 1-2: Vehicle type (90=Steam, 91=Electric, 92=Diesel loco, 94=Electric EMU, 95=Diesel EMU)
 * - Positions 3-4: Country code (55=Hungary)
 * - Positions 5-8: Specific type identifier
 * - Remaining: Individual vehicle number
 *
 * @param vehicleId EMMA format: "1:915504310018" or raw UIC: "915504310018"
 * @returns Parsed UIC information with detected train type
 */
function parseUIC(vehicleId) {
    // Extract UIC code from EMMA format "1:915504310018" -> "915504310018"
    const rawUIC = vehicleId.includes(':') ? vehicleId.split(':')[1] : vehicleId;
    console.log(`🔍 UIC Parser input: "${vehicleId}" -> raw: "${rawUIC}"`);
    // Validate UIC length (should be 12 digits for Hungarian rolling stock)
    if (!rawUIC || rawUIC.length < 8) {
        console.log(`❌ UIC validation failed: length ${(rawUIC === null || rawUIC === void 0 ? void 0 : rawUIC.length) || 0}, expected >=8`);
        return {
            vehicleType: 'unknown',
            propulsion: null,
            countryCode: '',
            typeCode: '',
            confidence: 0,
            rawUIC
        };
    }
    // Extract components
    const vehicleTypeCode = rawUIC.substring(0, 2);
    const countryCode = rawUIC.substring(2, 4);
    const typeCode = rawUIC.substring(4, 8);
    console.log(`🔍 UIC components: type=${vehicleTypeCode}, country=${countryCode}, typeCode=${typeCode}`);
    // Determine vehicle type and propulsion from first two digits
    let vehicleType = 'unknown';
    let propulsion = null;
    let confidence = 0;
    switch (vehicleTypeCode) {
        case '90':
            vehicleType = 'locomotive';
            propulsion = trainTypes_1.PropulsionType.STEAM;
            confidence = 0.9;
            break;
        case '91':
            vehicleType = 'locomotive';
            propulsion = trainTypes_1.PropulsionType.ELECTRIC;
            confidence = 0.9;
            break;
        case '92':
            vehicleType = 'locomotive';
            propulsion = trainTypes_1.PropulsionType.DIESEL;
            confidence = 0.9;
            break;
        case '94':
            vehicleType = 'emu';
            propulsion = trainTypes_1.PropulsionType.ELECTRIC;
            confidence = 0.9;
            break;
        case '95':
            vehicleType = 'dmu';
            propulsion = trainTypes_1.PropulsionType.DIESEL;
            confidence = 0.9;
            break;
        default:
            // Some edge cases or non-standard coding
            confidence = 0.3;
            break;
    }
    // Validate country code (should be 55 for Hungary)
    if (countryCode !== '55') {
        confidence *= 0.5; // Reduce confidence for non-Hungarian rolling stock
    }
    // Look up specific train type
    const trainType = (0, trainDatabase_1.getTrainTypeByUIC)(typeCode);
    if (trainType) {
        confidence = Math.max(confidence, 0.8); // High confidence if we have the type in database
    }
    const result = {
        vehicleType,
        propulsion,
        countryCode,
        typeCode,
        trainType,
        confidence,
        rawUIC
    };
    console.log(`🔍 UIC Parser: ${vehicleId} -> Type: ${vehicleType}, Propulsion: ${propulsion}, Code: ${typeCode}, Match: ${(trainType === null || trainType === void 0 ? void 0 : trainType.name) || 'Unknown'}, Confidence: ${(confidence * 100).toFixed(0)}%`);
    return result;
}
/**
 * Get a user-friendly description of the detected locomotive/EMU
 */
function getTrainDescription(uicResult) {
    if (uicResult.trainType) {
        return uicResult.trainType.name;
    }
    if (uicResult.confidence > 0.5) {
        const propulsionDesc = uicResult.propulsion || 'unknown';
        const typeDesc = uicResult.vehicleType;
        return `${propulsionDesc} ${typeDesc}`.replace('_', ' ');
    }
    return 'Unknown train type';
}
/**
 * Get comfort level description
 */
function getComfortDescription(trainType) {
    const features = [];
    if (trainType.hasAirConditioning) {
        features.push('AC');
    }
    else {
        features.push('No AC');
    }
    if (trainType.reliabilityRating >= 4) {
        features.push('Reliable');
    }
    else if (trainType.reliabilityRating <= 2) {
        features.push('Basic');
    }
    if (trainType.yearIntroduced >= 2010) {
        features.push('Modern');
    }
    else if (trainType.yearIntroduced <= 1980) {
        features.push('Vintage');
    }
    return features.join(' • ');
}
/**
 * Get appropriate icon for train type (MNR2007 font character or emoji fallback)
 */
function getTrainTypeEmoji(trainType) {
    // First try to get MNR2007 font character
    const { getMNRCharacter } = require('./mnrFont');
    const mnrChar = getMNRCharacter(trainType.uicCode);
    if (mnrChar) {
        return mnrChar;
    }
    // Fallback to emoji
    switch (trainType.category) {
        case 'emu':
            return '🚄'; // High-speed train for modern EMUs
        case 'dmu':
            return '🚆'; // Train for DMUs
        case 'locomotive':
            if (trainType.propulsion === trainTypes_1.PropulsionType.ELECTRIC) {
                return '⚡'; // Electric bolt for electric locomotives
            }
            else if (trainType.propulsion === trainTypes_1.PropulsionType.DIESEL) {
                return '🚂'; // Steam locomotive emoji for diesel (closest we have)
            }
            else {
                return '🚂'; // Default locomotive
            }
        case 'railcar':
            return '🚃'; // Railway car
        default:
            return '🚊'; // Tram (generic rail vehicle)
    }
}
/**
 * Get reliability stars display
 */
function getReliabilityStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    return '⭐'.repeat(fullStars) +
        (hasHalfStar ? '⭐' : '') +
        '☆'.repeat(emptyStars);
}
