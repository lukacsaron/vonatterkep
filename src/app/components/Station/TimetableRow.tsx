'use client';

import { Clock, MapPin, Train } from 'lucide-react';
import { Departure } from '@/types';
import { DelayIndicator } from '../UI/DelayIndicator';
import { TrainTypeBadge } from '../UI/TrainTypeBadge';
import { cn, formatTime } from '@/lib/utils';

interface TimetableRowProps {
  departure: Departure;
  type: 'departures' | 'arrivals';
  onClick?: (departure: Departure) => void;
  className?: string;
}

export function TimetableRow({ 
  departure, 
  type, 
  onClick, 
  className 
}: TimetableRowProps) {
  const hasDelay = departure.delay > 0;
  const actualTime = new Date(departure.time.getTime() + departure.delay * 60000);
  
  return (
    <div 
      className={cn(
        'flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors',
        'sm:grid sm:grid-cols-12 sm:gap-4',
        className
      )}
      onClick={() => onClick?.(departure)}
    >
      {/* Time Column */}
      <div className="flex flex-col items-start sm:col-span-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400 sm:hidden" />
          <div className="flex flex-col">
            <span 
              className={cn(
                'font-mono text-sm font-medium',
                hasDelay && 'line-through text-gray-400'
              )}
            >
              {formatTime(departure.time)}
            </span>
            {hasDelay && (
              <span className="font-mono text-sm font-medium text-red-600">
                {formatTime(actualTime)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Destination/Origin Column */}
      <div className="flex-1 sm:col-span-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-400 sm:hidden" />
          <div>
            <div className="font-medium text-gray-900 truncate">
              {departure.remoteStation.name}
            </div>
            <div className="text-xs text-gray-500 sm:hidden">
              {type === 'departures' ? 'To' : 'From'}
            </div>
          </div>
        </div>
      </div>

      {/* Train Info Column */}
      <div className="hidden sm:flex sm:col-span-3 sm:items-center sm:gap-2">
        <Train className="h-4 w-4 text-gray-400" />
        <div className="flex items-center gap-2">
          <TrainTypeBadge type={departure.train.type} />
          <span className="text-sm font-medium">
            {departure.train.number}
          </span>
        </div>
      </div>

      {/* Platform Column */}
      <div className="hidden sm:flex sm:col-span-1 sm:justify-center">
        {departure.platform && (
          <span className="text-sm font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded">
            {departure.platform}
          </span>
        )}
      </div>

      {/* Delay/Status Column */}
      <div className="sm:col-span-2 sm:flex sm:justify-end">
        <DelayIndicator 
          delay={departure.delay} 
          size="sm"
          className="sm:ml-auto"
        />
      </div>

      {/* Mobile-only bottom row */}
      <div className="w-full mt-2 flex items-center justify-between sm:hidden">
        <div className="flex items-center gap-2">
          <TrainTypeBadge type={departure.train.type} />
          <span className="text-sm font-medium">
            {departure.train.number}
          </span>
        </div>
        {departure.platform && (
          <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded">
            Platform {departure.platform}
          </span>
        )}
      </div>
    </div>
  );
}