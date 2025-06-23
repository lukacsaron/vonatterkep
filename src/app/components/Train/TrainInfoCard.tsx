import { Train, TrainDetails } from '@/types';
import { TrainTypeBadge } from '../UI/TrainTypeBadge';
import { DelayIndicator } from '../UI/DelayIndicator';
import { MapPin, Navigation, Clock, Gauge, X } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface TrainInfoCardProps {
  train: Train;
  onClose?: () => void;
}

export function TrainInfoCard({ train, onClose }: TrainInfoCardProps) {
  const [trainDetails, setTrainDetails] = useState<TrainDetails | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch detailed trip information via server API
  useEffect(() => {
    const fetchDetails = async () => {
      if (train.gtfsId) {
        setLoading(true);
        try {
          console.log(`🔍 Fetching trip details for ${train.gtfsId} via client API`);
          
          const response = await fetch(`/api/trains/${encodeURIComponent(train.gtfsId)}`);
          
          if (!response.ok) {
            console.warn(`Failed to fetch trip details: ${response.status} ${response.statusText}`);
            return;
          }
          
          const details: TrainDetails = await response.json();
          console.log(`✅ Received trip details:`, details);
          setTrainDetails(details);
        } catch (error) {
          console.error('Failed to fetch train details:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchDetails();
  }, [train.gtfsId]);

  const formatStopTime = (scheduledTime?: Date | string, actualTime?: Date | string) => {
    if (!scheduledTime) return '-';
    
    // Convert strings to Date objects if needed
    const scheduledDate = typeof scheduledTime === 'string' ? new Date(scheduledTime) : scheduledTime;
    const actualDate = typeof actualTime === 'string' ? new Date(actualTime) : actualTime;
    
    const scheduled = formatTime(scheduledDate);
    const actual = actualDate ? formatTime(actualDate) : scheduled;
    
    // Check if there's a delay
    const hasDelay = actualDate && Math.abs(actualDate.getTime() - scheduledDate.getTime()) > 60000; // 1 minute threshold
    
    return (
      <div className="text-sm">
        <div className={hasDelay ? 'line-through text-gray-400' : ''}>{scheduled}</div>
        {hasDelay && <div className="text-red-600">{actual}</div>}
      </div>
    );
  };

  const getDelayText = (delay: number) => {
    if (delay === 0) return 'nincs késés';
    return `${delay} perc késés`;
  };

  // Extract route code from train details or number
  const getRouteCode = () => {
    // Clean HTML and decode HTML entities
    const cleanHtml = (text: string) => {
      // First remove HTML tags
      let cleaned = text.replace(/<[^>]*>/g, '');
      // Then decode HTML entities
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cleaned;
      cleaned = tempDiv.textContent || tempDiv.innerText || '';
      return cleaned.trim();
    };

    if (trainDetails?.routeShortName) {
      const cleaned = cleanHtml(trainDetails.routeShortName);
      return cleaned ? `[${cleaned}]` : '';
    }
    if (trainDetails?.trainName) {
      const cleaned = cleanHtml(trainDetails.trainName);
      return cleaned ? `[${cleaned}]` : '';
    }
    
    // Fallback: try to extract from train number (e.g., S60, IC412, 855 TÓPART)
    const trainTypeMatch = train.number.match(/^(\d+)\s+([A-Z]+)/); // e.g., "855 TÓPART"
    if (trainTypeMatch) {
      const trainType = trainTypeMatch[2];
      if (trainType === 'InterCity') return '[IC]';
      if (trainType === 'InterRégió') return '[IR]';
      if (trainType === 'Expresszvonat') return '[EX]';
      if (trainType === 'sebesvonat') return '[SB]';
      return `[${trainType.substring(0, 2)}]`;
    }
    
    // Try to extract leading letters/numbers (e.g., S60, IC412)
    const codeMatch = train.number.match(/^([A-Z]+\d*)/);
    return codeMatch ? `[${codeMatch[1]}]` : '';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 min-w-[320px] max-w-[500px] max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold">
            {getRouteCode()} {train.number}
          </h3>
          <div className="text-gray-600">
            {trainDetails?.destination || train.destination?.name || 'Unknown destination'}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Status Info */}
      <div className="mb-4 space-y-1">
        <div className="text-sm">
          <span className="font-medium">Sebesség:</span> {Math.round(train.speed)} km/h
        </div>
        <div className="text-sm">
          <span className="font-medium">Késés:</span>{' '}
          <span className={trainDetails?.overallDelay && trainDetails.overallDelay > 0 ? 'text-red-600' : 'text-green-600'}>
            {getDelayText(trainDetails?.overallDelay ?? train.delay)}
          </span>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
          <div className="text-sm text-gray-600 mt-2">Loading trip details...</div>
        </div>
      )}

      {/* Stops Table */}
      {trainDetails?.stops && (
        <div className="popup-table-container">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-1 font-semibold">Állomás</th>
                <th className="text-center py-2 px-1 font-semibold">Érk.</th>
                <th className="text-center py-2 px-1 font-semibold">Ind.</th>
                <th className="text-center py-2 px-1 font-semibold">Vágány</th>
              </tr>
            </thead>
            <tbody>
              {trainDetails.stops.map((stop, index) => (
                <tr 
                  key={index} 
                  className={`border-b ${stop.isPassed ? 'passed bg-gray-50' : ''}`}
                >
                  <td className="py-2 px-1 font-medium">{stop.name}</td>
                  <td className="py-2 px-1 text-center">
                    {formatStopTime(stop.scheduledArrival, stop.actualArrival)}
                  </td>
                  <td className="py-2 px-1 text-center">
                    {formatStopTime(stop.scheduledDeparture, stop.actualDeparture)}
                  </td>
                  <td className="py-2 px-1 text-center">
                    {stop.platform || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fallback for no trip details */}
      {!loading && !trainDetails && train.gtfsId && (
        <div className="text-center py-4 text-gray-600">
          <div className="text-sm">Trip details not available</div>
        </div>
      )}

      {/* Basic info when no gtfsId */}
      {!train.gtfsId && (
        <div className="space-y-3">
          <DelayIndicator delay={train.delay} size="lg" />
          
          <div className="flex items-start gap-2">
            <Navigation className="h-4 w-4 text-gray-400 mt-0.5" />
            <div>
              <div className="text-sm text-gray-600">Destination</div>
              <div className="font-medium">{train.destination?.name || 'Unknown'}</div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Gauge className="h-4 w-4 text-gray-400 mt-0.5" />
            <div>
              <div className="text-sm text-gray-600">Speed</div>
              <div className="font-medium">{Math.round(train.speed)} km/h</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}