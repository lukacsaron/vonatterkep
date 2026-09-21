'use client';

import Link from 'next/link';
import { Clock, MapPin, Train } from 'lucide-react';
import { Departure } from '@/types';
import { DelayIndicator } from '../UI/DelayIndicator';
import { TrainTypeBadge } from '../UI/TrainTypeBadge';
import { cn, formatTime } from '@/lib/utils';

interface TimetableRowProps {
  departure: Departure;
  type: 'departures' | 'arrivals';
  /** Where the row leads (the train on the map). Renders the row as a real link. */
  href?: string;
  onClick?: (departure: Departure) => void;
  className?: string;
}

export function TimetableRow({
  departure,
  type,
  href,
  onClick,
  className
}: TimetableRowProps) {
  const hasDelay = departure.delay > 0;
  // The board comes straight from JSON, so `time` is an ISO string at runtime
  // despite the Date type; calling .getTime() on it crashed the whole page.
  const scheduledTime = new Date(departure.time);
  const hasTime = !Number.isNaN(scheduledTime.getTime());
  const actualTime = new Date(scheduledTime.getTime() + departure.delay * 60000);

  const rowClassName = cn(
    'flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors',
    'sm:grid sm:grid-cols-12 sm:gap-4',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
    className
  );

  const content = (
    <>
      {/* Time Column */}
      <div className="flex flex-col items-start sm:col-span-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400 sm:hidden" />
          <div className="flex flex-col">
            {/* Strike-through and red mark the changed time; say so in text too. */}
            <span
              className={cn(
                'font-mono text-sm font-medium',
                hasDelay && 'line-through text-gray-500'
              )}
            >
              {hasDelay && <span className="sr-only">Menetrend szerint </span>}
              {hasTime ? formatTime(scheduledTime) : '–'}
            </span>
            {hasDelay && hasTime && (
              <span className="font-mono text-sm font-medium text-red-600">
                <span className="sr-only">, várhatóan </span>
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
              {type === 'departures' ? 'Felé' : 'Onnan'}
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
            <span className="sr-only">Vágány </span>
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
            Vágány {departure.platform}
          </span>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        onClick={() => onClick?.(departure)}
        className={rowClassName}
      >
        {content}
      </Link>
    );
  }

  // Clickable without a URL: still reachable and operable from the keyboard.
  return (
    <div
      className={rowClassName}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(departure)}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick(departure);
        }
      }}
    >
      {content}
    </div>
  );
}
