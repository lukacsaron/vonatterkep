'use client';

import { useState } from 'react';
import { TrainSearchResult } from '@/types';
import { TrainTypeBadge } from '../UI/TrainTypeBadge';
import { DelayIndicator } from '../UI/DelayIndicator';
import { Clock, MapPin, ArrowRight, X } from 'lucide-react';
import { formatTime, formatDuration } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { TrainInfoCard } from './TrainInfoCard';

interface TrainSearchResultItemProps {
  train: TrainSearchResult;
  className?: string;
}

export function TrainSearchResultItem({ train, className }: TrainSearchResultItemProps) {
  const router = useRouter();
  const [showPopup, setShowPopup] = useState(false);

  const handleClick = () => {
    setShowPopup(true);
  };

  const handleViewOnMap = () => {
    router.push(`/?train=${encodeURIComponent(train.gtfsId)}`);
    setShowPopup(false);
  };

  const handleViewDetails = () => {
    router.push(`/trains/${encodeURIComponent(train.gtfsId)}`);
    setShowPopup(false);
  };

  // Convert TrainSearchResult to Train format for TrainInfoCard
  const trainForPopup = {
    id: train.gtfsId,
    number: train.trainNumber,
    type: train.trainType,
    position: { latitude: 0, longitude: 0 }, // Not available in search results
    speed: 0, // Not available in search results
    heading: 0, // Not available in search results
    delay: train.liveDelayMinutes || 0,
    destination: {
      id: '',
      name: train.destination.name,
      coordinates: { latitude: 0, longitude: 0 }
    },
    gtfsId: train.gtfsId,
    trainName: train.trainName
  };

  return (
    <div 
      onClick={handleClick}
      className={`bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all duration-200 ${className}`}
    >
      {/* Header with train number and type */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {train.trainNumber}
              {train.trainName && <span className="text-gray-600 ml-2">{train.trainName}</span>}
            </h3>
          </div>
          <TrainTypeBadge type={train.trainType} />
        </div>
        
        {/* Live delay indicator - only show if train is active */}
        {train.isActive && train.liveDelayMinutes !== undefined && (
          <DelayIndicator delay={train.liveDelayMinutes} size="sm" />
        )}
      </div>

      {/* Route information */}
      <div className="mb-3">
        {/* Desktop layout */}
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            {/* Origin */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900">{train.origin.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">{formatTime(train.origin.time)}</span>
              </div>
            </div>

            {/* Arrow and duration */}
            <div className="flex flex-col items-center px-4">
              <ArrowRight className="h-5 w-5 text-gray-400 mb-1" />
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {formatDuration(train.durationMinutes)}
              </span>
            </div>

            {/* Destination */}
            <div className="flex-1 text-right">
              <div className="flex items-center justify-end gap-2 mb-1">
                <span className="text-sm font-medium text-gray-900">{train.destination.name}</span>
                <MapPin className="h-4 w-4 text-gray-400" />
              </div>
              <div className="flex items-center justify-end gap-2">
                <span className="text-sm text-gray-600">{formatTime(train.destination.time)}</span>
                <Clock className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="md:hidden space-y-3">
          {/* Origin */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-900">{train.origin.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">{formatTime(train.origin.time)}</span>
            </div>
          </div>

          {/* Duration and arrow */}
          <div className="flex items-center justify-center gap-2">
            <ArrowRight className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">
              {formatDuration(train.durationMinutes)}
            </span>
          </div>

          {/* Destination */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-900">{train.destination.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">{formatTime(train.destination.time)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${train.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-xs text-gray-500">
            {train.isActive ? 'Jelenleg közlekedő' : 'Tervezett járat'}
          </span>
        </div>
        
        {train.liveDelayMinutes !== undefined && train.liveDelayMinutes > 0 && (
          <span className="text-xs text-red-600 font-medium">
            +{train.liveDelayMinutes} perc késés
          </span>
        )}
      </div>
      
      {/* Popup Modal */}
      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowPopup(false)}>
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{train.trainNumber} vonat</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleViewOnMap}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                >
                  Megtekintés a térképen
                </button>
                <button
                  onClick={handleViewDetails}
                  className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
                >
                  Teljes részletek
                </button>
                <button
                  onClick={() => setShowPopup(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-4">
              <TrainInfoCard train={trainForPopup} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}