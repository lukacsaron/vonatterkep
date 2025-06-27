import { Train, TrainDetails } from '@/types';
import { TrainTypeBadge } from '../UI/TrainTypeBadge';
import { DelayIndicator } from '../UI/DelayIndicator';
import { MapPin, Navigation, Clock, Gauge, X, Zap, Settings, Thermometer } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { 
  getTrainTypeEmoji, 
  getComfortDescription, 
  getReliabilityStars 
} from '@/lib/uicParser';

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
    <div ref={cardRef} className="bg-white rounded-l-3xl shadow-xl min-w-[350px] max-w-[400px] max-h-[80vh] relative border-l border-gray-300 overflow-hidden">
      {/* Header with gradient background */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 relative shadow-lg">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">
            {getRouteCode()}
          </h2>
          <h2 className="text-xl font-bold text-center">
            {train.number}
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 text-xl cursor-pointer transition-colors duration-200 hover:bg-white/20 rounded-full p-1"
              aria-label="Bezárás"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {/* Status information */}
        <div className="text-sm mt-2 flex gap-4 flex-wrap">
          {train.uicInfo && (
            <span className="flex items-center gap-1">
              <span className="opacity-80">UIC kód:</span>
              <span className="font-semibold text-white font-mono">
                {train.uicInfo.rawUIC?.replace(/(.{2})(.{2})(.{4})(.+)/, '$1 $2 $3 $4')}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="opacity-80">Sebesség:</span>
            <span className="font-semibold text-white">{Math.round(train.speed)} km/h</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="opacity-80">Késés:</span>
            <span className={`font-semibold ${trainDetails?.delay && trainDetails.delay > 0 ? 'text-yellow-200' : 'text-green-200'}`}>
              {getDelayText(trainDetails?.delay ?? train.delay)}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="opacity-80">Frissítve:</span>
            <span className="font-semibold text-white">1 perccel ezelőtt</span>
          </span>
        </div>
        
        {/* Route direction */}
        <div className="text-xs mt-2 opacity-80">
          <span className="font-semibold">Ismeretlen indulás</span>
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" className="mx-2 inline w-3 h-3">
            <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"></path>
          </svg>
          <span className="font-semibold">{trainDetails?.destination?.name || train.destination?.name || 'Ismeretlen cél'}</span>
        </div>
      </div>

      {/* Locomotive Information Section */}
      {train.locomotiveType && (
        <div className="bg-blue-50 px-4 py-3 border-b">
          <div className="flex flex-wrap gap-1">
            <span className="text-black px-2 py-1 text-lg select-none bg-white rounded border border-gray-200 hover:bg-gray-50 font-mono">
              {getTrainTypeEmoji(train.locomotiveType)}
            </span>
            <span className="text-black px-2 py-1 text-sm select-none bg-white rounded border border-gray-200 hover:bg-gray-50">
              {train.locomotiveType.name}
              {train.locomotiveType.nickname && ` "${train.locomotiveType.nickname}"`}
            </span>
            <span className="text-black px-2 py-1 text-sm select-none bg-white rounded border border-gray-200 hover:bg-gray-50">
              {train.locomotiveType.manufacturer}
            </span>
            <span className="text-black px-2 py-1 text-sm select-none bg-white rounded border border-gray-200 hover:bg-gray-50">
              {train.locomotiveType.yearIntroduced}
              {train.locomotiveType.modernized && ` (${train.locomotiveType.modernized})`}
            </span>
            <span className={`px-2 py-1 text-sm cursor-pointer rounded border transition-all duration-200 flex items-center gap-1 ${
              train.locomotiveType.hasAirConditioning 
                ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600 hover:shadow-md' 
                : 'bg-red-500 text-white border-red-600 hover:bg-red-600 hover:shadow-md'
            }`}>
              <Thermometer className="w-3 h-3" />
              <span className="font-semibold">{train.locomotiveType.hasAirConditioning ? 'AC' : 'Nincs AC'}</span>
            </span>
            <span className="px-2 py-1 text-sm select-none bg-yellow-100 text-yellow-800 rounded border border-yellow-200">
              {getReliabilityStars(train.locomotiveType.reliabilityRating)}
            </span>
          </div>
        </div>
      )}
      
      {/* Scrollable content */}
      <div className="overflow-y-auto max-h-[calc(80vh-200px)] px-4 py-3">

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