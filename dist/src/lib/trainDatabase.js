"use strict";
/**
 * Comprehensive Hungarian Railway Rolling Stock Database
 *
 * Based on UIC codes and real-world operational data.
 * Sources: Reddit r/hungary discussion, MÁV specifications, railway enthusiasts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HUNGARIAN_TRAIN_TYPES = void 0;
exports.getTrainTypeByUIC = getTrainTypeByUIC;
exports.getTrainTypesByCategory = getTrainTypesByCategory;
exports.getModernTrains = getModernTrains;
exports.searchTrainTypes = searchTrainTypes;
const trainTypes_1 = require("../types/trainTypes");
exports.HUNGARIAN_TRAIN_TYPES = {
    // ===== ELECTRIC LOCOMOTIVES =====
    // V43 Series - The workhorses of Hungarian railways
    "0431": {
        uicCode: "0431",
        name: "V43 1000",
        fullName: "V43 1000 series electric locomotive",
        manufacturer: "Ganz-MÁVAG",
        category: trainTypes_1.TrainCategory.LOCOMOTIVE,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: false,
        comfortLevel: trainTypes_1.ComfortLevel.BASIC,
        reliabilityRating: 3,
        maxSpeed: 160,
        yearIntroduced: 1963,
        modernized: 2010,
        features: ["Multiple unit capability", "Regenerative braking"],
        operationalNotes: "Backbone of passenger services, found on most IC/IR trains"
    },
    "0432": {
        uicCode: "0432",
        name: "V43 2000",
        fullName: "V43 2000 series electric locomotive (Fecske/Papagáj)",
        manufacturer: "Ganz-MÁVAG",
        category: trainTypes_1.TrainCategory.LOCOMOTIVE,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: false,
        comfortLevel: trainTypes_1.ComfortLevel.STANDARD,
        reliabilityRating: 4,
        maxSpeed: 160,
        yearIntroduced: 1982,
        modernized: 2015,
        features: ["Improved electronics", "Better reliability", "Multiple livery variants"],
        nickname: "Fecske/Papagáj",
        operationalNotes: "More reliable than 1000 series, colorful livery variants, workhorse locomotive"
    },
    "0433": {
        uicCode: "0433",
        name: "V43 3000",
        fullName: "V43 3000 'Cirmos' series electric locomotive",
        manufacturer: "Ganz-MÁVAG",
        category: trainTypes_1.TrainCategory.LOCOMOTIVE,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: false,
        comfortLevel: trainTypes_1.ComfortLevel.STANDARD,
        reliabilityRating: 4,
        maxSpeed: 160,
        yearIntroduced: 1985,
        modernized: 2018,
        features: ["Latest modernization", "Improved comfort"],
        nickname: "Cirmos",
        operationalNotes: "Most modernized V43 variant, best reliability"
    },
    // V46 Series
    "0460": {
        uicCode: "0460",
        name: "V46",
        fullName: "V46 electric locomotive",
        manufacturer: "Škoda",
        category: trainTypes_1.TrainCategory.LOCOMOTIVE,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: false,
        comfortLevel: trainTypes_1.ComfortLevel.BASIC,
        reliabilityRating: 3,
        maxSpeed: 120,
        yearIntroduced: 1981,
        features: ["Freight focused", "Occasional passenger use"],
        operationalNotes: "Primarily freight, sometimes passenger services"
    },
    // V63 Series  
    "0630": {
        uicCode: "0630",
        name: "V63",
        fullName: "V63 electric locomotive",
        manufacturer: "Škoda",
        category: trainTypes_1.TrainCategory.LOCOMOTIVE,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: false,
        comfortLevel: trainTypes_1.ComfortLevel.STANDARD,
        reliabilityRating: 4,
        maxSpeed: 140,
        yearIntroduced: 1975,
        modernized: 2005,
        features: ["Universal locomotive", "Good reliability"],
        operationalNotes: "Versatile locomotive for various services"
    },
    // Modern Electric Locomotives
    "0470": {
        uicCode: "0470",
        name: "EuroSprinter",
        fullName: "Siemens EuroSprinter electric locomotive",
        manufacturer: "Siemens",
        category: trainTypes_1.TrainCategory.LOCOMOTIVE,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: true,
        comfortLevel: trainTypes_1.ComfortLevel.MODERN,
        reliabilityRating: 5,
        maxSpeed: 200,
        yearIntroduced: 1996,
        features: ["Modern technology", "High speed capability", "Excellent reliability"],
        operationalNotes: "Premium locomotive for IC services"
    },
    "0480": {
        uicCode: "0480",
        name: "Traxx",
        fullName: "Bombardier Traxx electric locomotive",
        manufacturer: "Bombardier",
        category: trainTypes_1.TrainCategory.LOCOMOTIVE,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: true,
        comfortLevel: trainTypes_1.ComfortLevel.MODERN,
        reliabilityRating: 5,
        maxSpeed: 200,
        yearIntroduced: 2000,
        features: ["Latest technology", "Excellent reliability", "Quiet operation"],
        operationalNotes: "Modern locomotive for premium services"
    },
    "0471": {
        uicCode: "0471",
        name: "Vectron",
        fullName: "Siemens Vectron electric locomotive",
        manufacturer: "Siemens",
        category: trainTypes_1.TrainCategory.LOCOMOTIVE,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: true,
        comfortLevel: trainTypes_1.ComfortLevel.PREMIUM,
        reliabilityRating: 5,
        maxSpeed: 200,
        yearIntroduced: 2012,
        features: ["Latest generation", "Excellent fuel efficiency", "Ultra-quiet"],
        operationalNotes: "Newest generation locomotive, mainly GYSEV services"
    },
    // ===== DIESEL LOCOMOTIVES =====
    "0288": { uicCode: "0288", name: "M28", fullName: "M28 diesel locomotive", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.VINTAGE, reliabilityRating: 2, maxSpeed: 100, yearIntroduced: 1958, features: ["Historic locomotive"], operationalNotes: "Rare, mostly heritage services" },
    "0319": { uicCode: "0319", name: "M31", fullName: "M31 diesel locomotive", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 100, yearIntroduced: 1960, features: ["Branch line services"], operationalNotes: "Used on non-electrified lines" },
    "0408": { uicCode: "0408", name: "M40", fullName: "M40 diesel locomotive", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 120, yearIntroduced: 1963, features: ["Medium power"], operationalNotes: "Regional and freight services" },
    "0418": { uicCode: "0418", name: "M41", fullName: "M41 diesel locomotive", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 120, yearIntroduced: 1963, features: ["Reliable workhorse"], operationalNotes: "Common on non-electrified lines" },
    "0438": { uicCode: "0438", name: "M43", fullName: "M43 diesel locomotive", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 120, yearIntroduced: 1968, features: ["Upgraded M41"], operationalNotes: "Improved version of M41" },
    "0448": { uicCode: "0448", name: "M44", fullName: "M44 diesel locomotive", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.STANDARD, reliabilityRating: 4, maxSpeed: 120, yearIntroduced: 1973, features: ["More powerful"], operationalNotes: "Higher power diesel locomotive" },
    "0478": { uicCode: "0478", name: "M47", fullName: "M47 diesel locomotive", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.STANDARD, reliabilityRating: 4, maxSpeed: 140, yearIntroduced: 1975, modernized: 2000, features: ["High power", "Passenger services"], operationalNotes: "Most powerful Hungarian diesel, IC services" },
    "0618": { uicCode: "0618", name: "M61", fullName: "M61 diesel locomotive", manufacturer: "Nohab", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.VINTAGE, reliabilityRating: 3, maxSpeed: 120, yearIntroduced: 1963, features: ["Swedish design"], operationalNotes: "Distinctive Swedish-designed locomotive" },
    "0628": { uicCode: "0628", name: "M62", fullName: "M62 diesel locomotive", manufacturer: "Voroshilovgrad", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 100, yearIntroduced: 1965, features: ["Soviet design"], operationalNotes: "Soviet-era locomotive, freight focused" },
    "0638": { uicCode: "0638", name: "M63", fullName: "M63 diesel locomotive", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 120, yearIntroduced: 1975, features: ["Branch line specialist"], operationalNotes: "Light diesel for branch lines" },
    // ===== ELECTRIC MULTIPLE UNITS (EMUs) =====
    // Modern EMUs - The future of Hungarian railways
    "1415": {
        uicCode: "1415",
        name: "FLIRT",
        fullName: "Stadler FLIRT electric multiple unit",
        manufacturer: "Stadler",
        category: trainTypes_1.TrainCategory.EMU,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: true,
        comfortLevel: trainTypes_1.ComfortLevel.MODERN,
        reliabilityRating: 5,
        maxSpeed: 160,
        yearIntroduced: 2014,
        features: ["WiFi", "Power outlets", "Low floor", "Quiet operation", "Modern interior"],
        operationalNotes: "Game-changer for suburban and regional services"
    },
    "1435": {
        uicCode: "1435",
        name: "FLIRT3 GYSEV",
        fullName: "Stadler FLIRT3 electric multiple unit (GYSEV)",
        manufacturer: "Stadler",
        category: trainTypes_1.TrainCategory.EMU,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: true,
        comfortLevel: trainTypes_1.ComfortLevel.PREMIUM,
        reliabilityRating: 5,
        maxSpeed: 160,
        yearIntroduced: 2018,
        features: ["Latest FLIRT generation", "Premium interior", "WiFi", "USB charging", "Excellent ride quality"],
        operationalNotes: "GYSEV's premium EMU fleet, cross-border services"
    },
    "1815": {
        uicCode: "1815",
        name: "KISS",
        fullName: "Stadler KISS electric multiple unit",
        manufacturer: "Stadler",
        category: trainTypes_1.TrainCategory.EMU,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: true,
        comfortLevel: trainTypes_1.ComfortLevel.PREMIUM,
        reliabilityRating: 5,
        maxSpeed: 160,
        yearIntroduced: 2019,
        features: ["Double-deck", "High capacity", "WiFi", "Modern amenities", "Quiet operation"],
        operationalNotes: "High-capacity double-deck EMU for busy routes"
    },
    "1406": {
        uicCode: "1406",
        name: "CityLink",
        fullName: "Stadler CityLink electric multiple unit",
        manufacturer: "Stadler",
        category: trainTypes_1.TrainCategory.EMU,
        propulsion: trainTypes_1.PropulsionType.ELECTRIC,
        hasAirConditioning: true,
        comfortLevel: trainTypes_1.ComfortLevel.MODERN,
        reliabilityRating: 5,
        maxSpeed: 120,
        yearIntroduced: 2020,
        features: ["Urban design", "Frequent stopping", "Low floor", "Wide doors"],
        operationalNotes: "Designed for suburban services with frequent stops"
    },
    // Other EMUs
    "1425": { uicCode: "1425", name: "Talent", fullName: "Bombardier Talent electric multiple unit", manufacturer: "Bombardier", category: trainTypes_1.TrainCategory.EMU, propulsion: trainTypes_1.PropulsionType.ELECTRIC, hasAirConditioning: true, comfortLevel: trainTypes_1.ComfortLevel.MODERN, reliabilityRating: 4, maxSpeed: 160, yearIntroduced: 2006, features: ["Tilting technology", "Comfortable seating"], operationalNotes: "Tilting EMU for faster regional services" },
    "1426": { uicCode: "1426", name: "Desiro", fullName: "Siemens Desiro electric multiple unit", manufacturer: "Siemens", category: trainTypes_1.TrainCategory.EMU, propulsion: trainTypes_1.PropulsionType.ELECTRIC, hasAirConditioning: true, comfortLevel: trainTypes_1.ComfortLevel.MODERN, reliabilityRating: 4, maxSpeed: 160, yearIntroduced: 2008, features: ["Reliable operation", "Good comfort"], operationalNotes: "Workhorse EMU for regional services" },
    // ===== DIESEL MULTIPLE UNITS (DMUs) =====
    "0117": {
        uicCode: "0117",
        name: "Bzmot",
        fullName: "Bzmot diesel railcar",
        manufacturer: "Ganz-MÁVAG",
        category: trainTypes_1.TrainCategory.RAILCAR,
        propulsion: trainTypes_1.PropulsionType.DIESEL,
        hasAirConditioning: false,
        comfortLevel: trainTypes_1.ComfortLevel.BASIC,
        reliabilityRating: 3,
        maxSpeed: 80,
        yearIntroduced: 1975,
        features: ["Single unit", "Branch line specialist"],
        nickname: "Kispiros",
        operationalNotes: "Iconic Hungarian railcar, branch line services"
    },
    "0127": { uicCode: "0127", name: "Bzmot IP", fullName: "Bzmot IP diesel railcar", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.RAILCAR, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.STANDARD, reliabilityRating: 3, maxSpeed: 80, yearIntroduced: 1990, modernized: 2010, features: ["Improved version", "Better comfort"], operationalNotes: "Modernized Bzmot variant" },
    "1136": { uicCode: "1136", name: "Bzmot Iker", fullName: "Bzmot twin-unit diesel railcar", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.DMU, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.STANDARD, reliabilityRating: 3, maxSpeed: 80, yearIntroduced: 1985, features: ["Twin unit", "Higher capacity"], operationalNotes: "Two-unit Bzmot for higher capacity" },
    // Special DMUs
    "1446": { uicCode: "1446", name: "Jenbacher", fullName: "Jenbacher J3998 diesel multiple unit", manufacturer: "Jenbacher", category: trainTypes_1.TrainCategory.DMU, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 80, yearIntroduced: 1960, features: ["Austrian design"], operationalNotes: "GYSEV operation, cross-border services" },
    // Motor coaches
    "0414": { uicCode: "0414", name: "BDVmot", fullName: "BDVmot motor coach", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.RAILCAR, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 80, yearIntroduced: 1970, features: ["Motor coach"], operationalNotes: "Passenger/baggage motor coach" },
    "0424": { uicCode: "0424", name: "BVhmot", fullName: "BVhmot motor coach", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.RAILCAR, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 80, yearIntroduced: 1975, features: ["Heating coach"], operationalNotes: "Motor coach with heating capability" },
    "0434": { uicCode: "0434", name: "BVmot", fullName: "BVmot motor coach", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.RAILCAR, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 80, yearIntroduced: 1980, features: ["Basic motor coach"], operationalNotes: "Standard motor coach for branch lines" },
    // ===== SPECIAL UNITS =====
    "1416": { uicCode: "1416", name: "Bpmot", fullName: "Metrovagonmas Bpmot electric multiple unit", manufacturer: "Metrovagonmas", category: trainTypes_1.TrainCategory.EMU, propulsion: trainTypes_1.PropulsionType.ELECTRIC, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 2, maxSpeed: 80, yearIntroduced: 1985, features: ["Soviet design"], operationalNotes: "Soviet-era EMU, limited use" },
    "1488": { uicCode: "1488", name: "VF", fullName: "Villamos fűtőgép (Electric heating unit)", manufacturer: "Various", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.ELECTRIC, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.BASIC, reliabilityRating: 3, maxSpeed: 80, yearIntroduced: 1970, features: ["Heating provision"], operationalNotes: "Electric heating unit for passenger cars" },
    "2232": { uicCode: "2232", name: "M32", fullName: "M32 narrow gauge locomotive", manufacturer: "Ganz-MÁVAG", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.VINTAGE, reliabilityRating: 3, maxSpeed: 40, yearIntroduced: 1960, features: ["Narrow gauge"], operationalNotes: "Narrow gauge forest railways" },
    // International/leased locomotives
    "6182": { uicCode: "6182", name: "EuroSprinter Akiem", fullName: "Siemens EuroSprinter (Akiem leased)", manufacturer: "Siemens", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.ELECTRIC, hasAirConditioning: true, comfortLevel: trainTypes_1.ComfortLevel.MODERN, reliabilityRating: 5, maxSpeed: 200, yearIntroduced: 2005, features: ["Leased locomotive", "International services"], operationalNotes: "Leased from Akiem for international services" },
    "0001": { uicCode: "0001", name: "Viking", fullName: "Henschel Viking diesel locomotive", manufacturer: "Henschel", category: trainTypes_1.TrainCategory.LOCOMOTIVE, propulsion: trainTypes_1.PropulsionType.DIESEL, hasAirConditioning: false, comfortLevel: trainTypes_1.ComfortLevel.VINTAGE, reliabilityRating: 2, maxSpeed: 100, yearIntroduced: 1960, features: ["German design"], operationalNotes: "Rare German locomotive, heritage use" }
};
// Helper function to get train type by UIC code
function getTrainTypeByUIC(uicCode) {
    return exports.HUNGARIAN_TRAIN_TYPES[uicCode];
}
// Helper function to get all train types by category
function getTrainTypesByCategory(category) {
    return Object.values(exports.HUNGARIAN_TRAIN_TYPES).filter(type => type.category === category);
}
// Helper function to get modern trains (with AC)
function getModernTrains() {
    return Object.values(exports.HUNGARIAN_TRAIN_TYPES).filter(type => type.hasAirConditioning);
}
// Helper function to search train types
function searchTrainTypes(query) {
    const lowercaseQuery = query.toLowerCase();
    return Object.values(exports.HUNGARIAN_TRAIN_TYPES).filter(type => type.name.toLowerCase().includes(lowercaseQuery) ||
        type.fullName.toLowerCase().includes(lowercaseQuery) ||
        type.manufacturer.toLowerCase().includes(lowercaseQuery) ||
        (type.nickname && type.nickname.toLowerCase().includes(lowercaseQuery)));
}
