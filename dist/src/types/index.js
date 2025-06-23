"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DelayCategory = exports.DepartureStatus = exports.TrainType = void 0;
var TrainType;
(function (TrainType) {
    TrainType["IC"] = "IC";
    TrainType["EC"] = "EC";
    TrainType["RAILJET"] = "RJ";
    TrainType["REGIONAL"] = "REG";
    TrainType["SUBURBAN"] = "S";
    TrainType["NIGHT"] = "EN";
})(TrainType || (exports.TrainType = TrainType = {}));
var DepartureStatus;
(function (DepartureStatus) {
    DepartureStatus["ON_TIME"] = "ON_TIME";
    DepartureStatus["DELAYED"] = "DELAYED";
    DepartureStatus["CANCELLED"] = "CANCELLED";
    DepartureStatus["DEPARTED"] = "DEPARTED";
})(DepartureStatus || (exports.DepartureStatus = DepartureStatus = {}));
var DelayCategory;
(function (DelayCategory) {
    DelayCategory["ON_TIME"] = "ON_TIME";
    DelayCategory["MINOR"] = "MINOR";
    DelayCategory["MODERATE"] = "MODERATE";
    DelayCategory["SEVERE"] = "SEVERE";
})(DelayCategory || (exports.DelayCategory = DelayCategory = {}));
