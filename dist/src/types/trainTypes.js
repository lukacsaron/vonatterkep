"use strict";
/**
 * UIC Train Type Detection System
 *
 * This system parses UIC vehicle identification codes to detect Hungarian
 * locomotive and EMU types, providing passengers with comfort and reliability information.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComfortLevel = exports.PropulsionType = exports.TrainCategory = void 0;
var TrainCategory;
(function (TrainCategory) {
    TrainCategory["LOCOMOTIVE"] = "locomotive";
    TrainCategory["EMU"] = "emu";
    TrainCategory["DMU"] = "dmu";
    TrainCategory["RAILCAR"] = "railcar"; // Single unit
})(TrainCategory || (exports.TrainCategory = TrainCategory = {}));
var PropulsionType;
(function (PropulsionType) {
    PropulsionType["STEAM"] = "steam";
    PropulsionType["ELECTRIC"] = "electric";
    PropulsionType["DIESEL"] = "diesel";
    PropulsionType["HYBRID"] = "hybrid";
})(PropulsionType || (exports.PropulsionType = PropulsionType = {}));
var ComfortLevel;
(function (ComfortLevel) {
    ComfortLevel["VINTAGE"] = "vintage";
    ComfortLevel["BASIC"] = "basic";
    ComfortLevel["STANDARD"] = "standard";
    ComfortLevel["MODERN"] = "modern";
    ComfortLevel["PREMIUM"] = "premium"; // Latest tech, excellent comfort
})(ComfortLevel || (exports.ComfortLevel = ComfortLevel = {}));
