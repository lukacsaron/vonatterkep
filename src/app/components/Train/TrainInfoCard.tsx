import { Train, TrainDetails } from '@/types';
import { TrainTypeBadge } from '../UI/TrainTypeBadge';
import { DelayIndicator } from '../UI/DelayIndicator';
import { MapPin, Navigation, Clock, Gauge, X } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';

interface TrainInfoCardProps {
  train: Train;
  onClose?: () => void;
}

export function TrainInfoCard({ train, onClose }: TrainInfoCardProps) {
  const [trainDetails, setTrainDetails] = useState<Train | null>(null);
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Fetch enhanced train information via server API
  useEffect(() => {
    const fetchDetails = async () => {
      if (train.gtfsId) {
        setLoading(true);
        try {
          console.log(`🔍 Fetching enhanced train details for ${train.gtfsId} via client API`);
          
          const response = await fetch(`/api/trains/${encodeURIComponent(train.gtfsId)}`);
          
          if (!response.ok) {
            console.warn(`Failed to fetch trip details: ${response.status} ${response.statusText}`);
            return;
          }
          
          const details: Train = await response.json();
          console.log(`✅ Received enhanced train details:`, details);
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

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node) && onClose) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div ref={cardRef} className="bg-white rounded-lg shadow-lg min-w-[320px] max-w-[500px] max-h-[80vh] relative">
      {/* Close button - positioned absolutely outside scrollable area */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 bg-white text-gray-400 hover:text-gray-600 p-2 rounded-full shadow-md hover:shadow-lg transition-all z-10"
          aria-label="Bezárás"
        >
          <X size={16} />
        </button>
      )}
      
      {/* Scrollable content - with padding to avoid close button */}
      <div className="p-4 pr-12 overflow-y-auto max-h-[80vh]">
      
        {/* Header */}
        <div className="mb-3 pr-2">
          <div>
            <h3 className="text-lg font-semibold">
              {getRouteCode()} {train.number}
            </h3>
            <div className="text-gray-600">
              {trainDetails?.destination?.name || train.destination?.name || 'Ismeretlen cél'}
            </div>
          </div>
        </div>

        {/* Status Info */}
        <div className="mb-4 space-y-1">
          <div className="text-sm">
            <span className="font-medium">Sebesség:</span> {Math.round(train.speed)} km/h
          </div>
          <div className="text-sm">
            <span className="font-medium">Késés:</span>{' '}
            <span className={trainDetails?.delay && trainDetails.delay > 0 ? 'text-red-600' : 'text-green-600'}>
              {getDelayText(trainDetails?.delay ?? train.delay)}
            </span>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            <div className="text-sm text-gray-600 mt-2">További részletek betöltése...</div>
          </div>
        )}

        {/* Route timetable table */}
        {trainDetails?.route && trainDetails.route.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Menetrend</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-1 font-medium text-gray-700">Állomás</th>
                    <th className="text-center py-2 px-1 font-medium text-gray-700">Érk.</th>
                    <th className="text-center py-2 px-1 font-medium text-gray-700">Ind.</th>
                    <th className="text-center py-2 px-1 font-medium text-gray-700">Vágány</th>
                  </tr>
                </thead>
                <tbody>
                  {trainDetails.route.map((stop, index) => {
                    const isPassed = stop.isPassed || false;
                    
                    return (
                      <tr 
                        key={index} 
                        className={`border-b border-gray-100 ${isPassed ? 'text-gray-500' : ''}`}
                      >
                        <td className="py-2 px-1 font-medium">
                          {stop.station.name}
                        </td>
                        <td className="text-center py-2 px-1">
                          {stop.arrival ? (
                            <div className="flex flex-col items-center">
                              <span className={isPassed ? 'line-through' : ''}>
                                {formatTime(new Date(stop.arrival))}
                              </span>
                              {stop.actualArrival && (
                                <span className={stop.delay && stop.delay > 0 ? 'text-red-600 text-xs' : 'text-green-600 text-xs'}>
                                  {formatTime(new Date(stop.actualArrival))}
                                </span>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="text-center py-2 px-1">
                          {stop.departure ? (
                            <div className="flex flex-col items-center">
                              <span className={isPassed ? 'line-through' : ''}>
                                {formatTime(new Date(stop.departure))}
                              </span>
                              {stop.actualDeparture && (
                                <span className={stop.delay && stop.delay > 0 ? 'text-red-600 text-xs' : 'text-green-600 text-xs'}>
                                  {formatTime(new Date(stop.actualDeparture))}
                                </span>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="text-center py-2 px-1">
                          {stop.platform ? (
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                              {stop.platform}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Fallback for no enhanced details */}
        {!loading && !trainDetails && train.gtfsId && (
          <div className="text-center py-4 text-gray-600">
            <div className="text-sm">További vonatrészletek nem elérhetőek</div>
          </div>
        )}

        {/* Basic info when no gtfsId */}
        {!train.gtfsId && (
          <div className="space-y-3">
            <DelayIndicator delay={train.delay} size="lg" />
            
            <div className="flex items-start gap-2">
              <Navigation className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <div className="text-sm text-gray-600">Célállomás</div>
                <div className="font-medium">{train.destination?.name || 'Ismeretlen'}</div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Gauge className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <div className="text-sm text-gray-600">Sebesség</div>
                <div className="font-medium">{Math.round(train.speed)} km/h</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}