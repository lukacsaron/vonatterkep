'use client';

import { Navigation, Loader2 } from 'lucide-react';
import { useLocationStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function LocationButton() {
  const { requestLocation, isLocating, permissionState, isCentered } = useLocationStore();
  const isDisabled = isLocating || permissionState === 'denied' || permissionState === 'unavailable';
  
  const getTitle = () => {
    if (isLocating) return 'Helymeghatározás...';
    if (isDisabled) return 'Helymeghatározás nem elérhető vagy letiltva';
    return 'Ugrás a helyzetemre';
  };

  return (
    <button
      onClick={requestLocation}
      disabled={isDisabled}
      title={getTitle()}
      className={cn(
        'bg-white rounded-full shadow-md p-3 text-gray-600 hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        isCentered && !isLocating && 'bg-blue-100 text-blue-600 hover:bg-blue-200'
      )}
    >
      {isLocating ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Navigation className="h-5 w-5" />
      )}
    </button>
  );
}