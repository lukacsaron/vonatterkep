import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DelayCategory } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDelayCategory(delayMinutes: number): DelayCategory {
  // Updated delay categories with new intervals
  if (delayMinutes <= 4) return DelayCategory.ON_TIME;     // 0-4 perc késés
  if (delayMinutes <= 19) return DelayCategory.MINOR;     // 5-19 perc késés  
  if (delayMinutes <= 59) return DelayCategory.MODERATE;  // 20-59 perc késés
  return DelayCategory.SEVERE;                            // 60+ perc késés
}

export function getDelayColor(category: DelayCategory): string {
  // Beautiful, softer colors with updated delay ranges
  switch (category) {
    case DelayCategory.ON_TIME:
      return '#10b981'; // beautiful green (0-4 perc késés)
    case DelayCategory.MINOR:
      return '#eab308'; // beautiful yellow (5-19 perc késés)
    case DelayCategory.MODERATE:
      return '#f97316'; // beautiful orange (20-59 perc késés)
    case DelayCategory.SEVERE:
      return '#ef4444'; // beautiful red (60+ perc késés)
  }
}

export function formatDelay(minutes: number): string {
  if (minutes === 0) return 'Pontos';
  if (minutes < 60) return `+${minutes} perc`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `+${hours}ó ${mins}p`;
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('hu-HU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Budapest', // Explicitly use Hungary timezone
  });
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

export function formatPrice(amount: number, currency: string = 'HUF'): string {
  return new Intl.NumberFormat('hu-HU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): T {
  let timeout: NodeJS.Timeout;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}