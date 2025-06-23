"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cn = cn;
exports.getDelayCategory = getDelayCategory;
exports.getDelayColor = getDelayColor;
exports.formatDelay = formatDelay;
exports.formatTime = formatTime;
exports.formatDuration = formatDuration;
exports.formatDistance = formatDistance;
exports.formatPrice = formatPrice;
exports.calculateDistance = calculateDistance;
exports.debounce = debounce;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
const types_1 = require("@/types");
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
function getDelayCategory(delayMinutes) {
    // Match holavonat's exact delay categories
    if (delayMinutes <= 4)
        return types_1.DelayCategory.ON_TIME; // 0-4 perc késés
    if (delayMinutes <= 14)
        return types_1.DelayCategory.MINOR; // 5-14 perc késés  
    if (delayMinutes <= 59)
        return types_1.DelayCategory.MODERATE; // 15-59 perc késés
    return types_1.DelayCategory.SEVERE; // 60+ perc késés
}
function getDelayColor(category) {
    // Beautiful, softer colors (keep holavonat's delay ranges but better colors)
    switch (category) {
        case types_1.DelayCategory.ON_TIME:
            return '#10b981'; // beautiful green (0-4 perc késés)
        case types_1.DelayCategory.MINOR:
            return '#eab308'; // beautiful yellow (5-14 perc késés)
        case types_1.DelayCategory.MODERATE:
            return '#f97316'; // beautiful orange (15-59 perc késés)
        case types_1.DelayCategory.SEVERE:
            return '#ef4444'; // beautiful red (60+ perc késés)
    }
}
function formatDelay(minutes) {
    if (minutes === 0)
        return 'On time';
    if (minutes < 60)
        return `+${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `+${hours}h ${mins}m`;
}
function formatTime(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('hu-HU', {
        hour: '2-digit',
        minute: '2-digit',
    });
}
function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0)
        return `${mins}m`;
    if (mins === 0)
        return `${hours}h`;
    return `${hours}h ${mins}m`;
}
function formatDistance(km) {
    if (km < 1)
        return `${Math.round(km * 1000)}m`;
    return `${km.toFixed(1)}km`;
}
function formatPrice(amount, currency = 'HUF') {
    return new Intl.NumberFormat('hu-HU', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
function toRad(deg) {
    return deg * (Math.PI / 180);
}
function debounce(func, wait) {
    let timeout;
    return ((...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    });
}
