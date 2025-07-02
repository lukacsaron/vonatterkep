import { Train, TrainDetails } from '@/types';
import { TrainType } from '@/types/trainTypes';
import { TrainTypeBadge } from '../UI/TrainTypeBadge';
import { DelayIndicator } from '../UI/DelayIndicator';
import { MapPin, Navigation, Clock, Gauge, X, Zap, Settings, Thermometer, ChevronDown, ChevronRight } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { 
  getTrainTypeEmoji, 
  getComfortDescription, 
  getReliabilityStars 
} from '@/lib/uicParser';
import { 
  TRAIN_TYPE_DESCRIPTIONS, 
  getMNRServiceCharacter, 
  getServiceDescription 
} from '@/lib/mnrFont';

interface TrainInfoCardProps {
  train: Train;
  onClose?: () => void;
  disableClickOutside?: boolean;
}

interface LocomotiveInfoSectionProps {
  locomotiveType: TrainType;
}

function LocomotiveInfoSection({ locomotiveType }: LocomotiveInfoSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="bg-gray-50 border-b flex-shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className="w-full px-4 md:px-4 py-4 md:py-3 flex items-center justify-between text-left hover:bg-gray-100 transition-colors min-h-[56px] md:min-h-auto"
      >
        <h3 className="text-base md:text-sm font-semibold text-gray-700">Mozgóállomány információ</h3>
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 md:w-4 md:h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-5 h-5 md:w-4 md:h-4 text-gray-500" />
        )}
      </button>
      
      {isExpanded && (
        <div className="px-4 md:px-4 pb-4 md:pb-4 space-y-3 md:space-y-2">
          {/* Train type and name */}
          <div className="flex items-center gap-3 md:gap-2">
            <span 
              className="text-3xl md:text-2xl mnr-font cursor-help" 
              title={TRAIN_TYPE_DESCRIPTIONS[locomotiveType.uicCode] || locomotiveType.fullName}
            >
              {getTrainTypeEmoji(locomotiveType)}
            </span>
            <div>
              <div className="font-semibold text-gray-900 text-lg md:text-base">
                {locomotiveType.name}
                {locomotiveType.nickname && (
                  <span className="text-gray-600 font-normal ml-1">
                    &ldquo;{locomotiveType.nickname}&rdquo;
                  </span>
                )}
              </div>
              <div className="text-base md:text-sm text-gray-600">
                {locomotiveType.manufacturer} • {locomotiveType.yearIntroduced}
                {locomotiveType.modernized && ` (felújítva: ${locomotiveType.modernized})`}
              </div>
            </div>
          </div>
          
          {/* Features */}
          <div className="flex flex-wrap gap-3 md:gap-2 mt-4 md:mt-3">
            <div className={`flex items-center gap-2 md:gap-1 px-3 py-2 md:px-2 md:py-1 rounded-full text-sm md:text-sm font-medium min-h-[40px] md:min-h-auto ${
              locomotiveType.hasAirConditioning 
                ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}>
              <Thermometer className="w-4 h-4 md:w-3 md:h-3" />
              {locomotiveType.hasAirConditioning ? 'Klimatizált' : 'Nincs klíma'}
            </div>
            
            {locomotiveType.maxSpeed && (
              <div className="flex items-center gap-2 md:gap-1 px-3 py-2 md:px-2 md:py-1 rounded-full text-sm md:text-sm font-medium bg-green-100 text-green-800 border border-green-200 min-h-[40px] md:min-h-auto">
                <Gauge className="w-4 h-4 md:w-3 md:h-3" />
                Max: {locomotiveType.maxSpeed} km/h
              </div>
            )}
            
            <div className="flex items-center gap-2 md:gap-1 px-3 py-2 md:px-2 md:py-1 rounded-full text-sm md:text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-200 min-h-[40px] md:min-h-auto">
              <span>Megbízhatóság:</span>
              <span>{getReliabilityStars(locomotiveType.reliabilityRating)}</span>
            </div>
          </div>
          
          {/* Comfort description */}
          <div className="text-base md:text-sm text-gray-600 mt-3 md:mt-2">
            <span className="font-medium">Komfort:</span> {getComfortDescription(locomotiveType)}
          </div>
        </div>
      )}
    </div>
  );
}

export function TrainInfoCard({ train, onClose, disableClickOutside = false }: TrainInfoCardProps) {
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

  // Handle click outside to close (only when not disabled)
  useEffect(() => {
    if (!onClose || disableClickOutside) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node) && onClose) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, disableClickOutside]);

  return (
    <div 
      ref={cardRef} 
      className="bg-white w-full h-full md:rounded-3xl md:shadow-xl md:max-w-[400px] md:max-h-[80vh] relative md:border md:border-gray-300 overflow-hidden flex flex-col"
      style={{ 
        margin: 0,
        maxWidth: typeof window !== 'undefined' && window.innerWidth < 768 ? '100vw' : undefined
      }}
    >
      {/* Mobile handle bar */}
      <div className="md:hidden flex justify-center py-2 bg-gray-100 w-full" style={{ margin: 0 }}>
        <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
      </div>
      
      {/* Header - Clean design matching app theme */}
      <div className="bg-white border-b-2 border-blue-500 p-4 md:p-4 relative flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-1 h-12 md:w-2 md:h-8 bg-blue-500 rounded"></div>
            <div>
              <h2 className="text-2xl md:text-xl font-bold text-gray-900">
                {train.number}
              </h2>
              {getRouteCode() && (
                <div className="text-base md:text-sm text-blue-600 font-medium">
                  {getRouteCode()}
                </div>
              )}
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-3 md:p-2 hover:bg-gray-100 rounded-full transition-colors duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Bezárás"
            >
              <X className="w-6 h-6 md:w-5 md:h-5" />
            </button>
          )}
        </div>
        
        {/* Route direction */}
        <div className="text-base md:text-sm mt-4 md:mt-3 text-gray-600">
          <span className="font-medium">Útvonal:</span>
          <div className="ml-2 font-semibold text-gray-900 mt-2 md:mt-1 text-lg md:text-base">
            {(() => {
              // Prioritize trainDetails (enhanced data) over base train data
              const origin = trainDetails?.origin?.name || train.origin?.name;
              const destination = trainDetails?.destination?.name || train.destination?.name;
              
              if (origin && destination) {
                return `${origin} → ${destination}`;
              } else if (destination) {
                return `${destination}`;
              } else {
                return 'Ismeretlen útvonal';
              }
            })()}
          </div>
        </div>
        
        {/* Status information grid */}
        <div className="grid grid-cols-2 gap-4 md:gap-3 mt-6 md:mt-4">
          <div className="flex items-center gap-3 md:gap-2 p-3 md:p-0 bg-gray-50 md:bg-transparent rounded-xl md:rounded-none">
            <Gauge className="w-5 h-5 md:w-4 md:h-4 text-blue-500" />
            <div>
              <div className="text-sm md:text-xs text-gray-500">Sebesség</div>
              <div className="font-semibold text-gray-900 text-lg md:text-base">{Math.round(train.speed)} km/h</div>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-2 p-3 md:p-0 bg-gray-50 md:bg-transparent rounded-xl md:rounded-none">
            <Clock className="w-5 h-5 md:w-4 md:h-4 text-blue-500" />
            <div>
              <div className="text-sm md:text-xs text-gray-500">Késés</div>
              <div className={`font-semibold text-lg md:text-base ${
                (trainDetails?.delay ?? train.delay) > 0 
                  ? 'text-red-600' 
                  : 'text-green-600'
              }`}>
                {getDelayText(trainDetails?.delay ?? train.delay)}
              </div>
            </div>
          </div>
          {train.uicInfo && (
            <div className="col-span-2 flex items-center gap-3 md:gap-2 p-3 md:p-0 bg-gray-50 md:bg-transparent rounded-xl md:rounded-none">
              <Settings className="w-5 h-5 md:w-4 md:h-4 text-blue-500" />
              <div>
                <div className="text-sm md:text-xs text-gray-500">UIC kód</div>
                <div className="font-mono text-base md:text-sm font-semibold text-gray-900">
                  {train.uicInfo.rawUIC?.replace(/(.{2})(.{2})(.{4})(.+)/, '$1 $2 $3 $4')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Locomotive Information Section */}
      {train.locomotiveType && (
        <LocomotiveInfoSection locomotiveType={train.locomotiveType} />
      )}

      {/* Service Features Section */}
      {(train.infoServices || trainDetails?.infoServices) && (
        <div className="bg-gray-50 px-4 md:px-4 py-4 md:py-4 border-b flex-shrink-0">
          <h3 className="text-base md:text-sm font-semibold text-gray-700 mb-4 md:mb-3">Szolgáltatások</h3>
          <div className="flex flex-wrap gap-3 md:gap-2">
            {(trainDetails?.infoServices || train.infoServices || []).map((service, index) => {
              const serviceChar = getMNRServiceCharacter(service.fontCode);
              const serviceDesc = getServiceDescription(service.fontCode);
              
              if (!serviceChar || !serviceDesc) return null;
              
              return (
                <div 
                  key={index}
                  className="flex items-center gap-2 md:gap-1 px-3 py-2 md:px-2 md:py-1 bg-white border border-gray-200 rounded-full text-sm md:text-sm hover:bg-blue-50 hover:border-blue-200 transition-colors cursor-help min-h-[44px] md:min-h-auto"
                  title={serviceDesc}
                >
                  <span className="mnr-font text-blue-600 font-medium text-lg md:text-base">
                    {serviceChar}
                  </span>
                  <span className="text-gray-700 text-sm md:text-xs font-medium">
                    {serviceDesc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Scrollable content */}
      <div className="overflow-y-auto flex-1 px-4 md:px-4 py-4 md:py-3">

        {/* Loading state */}
        {loading && (
          <div className="text-center py-8 md:py-4">
            <div className="animate-spin rounded-full h-8 w-8 md:h-6 md:w-6 border-b-2 border-blue-600 mx-auto"></div>
            <div className="text-base md:text-sm text-gray-600 mt-3 md:mt-2">További részletek betöltése...</div>
          </div>
        )}

        {/* Route timetable table */}
        {trainDetails?.route && trainDetails.route.length > 0 && (
          <div className="space-y-4 md:space-y-3">
            <h4 className="font-semibold text-lg md:text-sm">Menetrend</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-base md:text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 md:py-2 px-2 md:px-1 font-medium text-gray-700">Állomás</th>
                    <th className="text-center py-3 md:py-2 px-2 md:px-1 font-medium text-gray-700">Érk.</th>
                    <th className="text-center py-3 md:py-2 px-2 md:px-1 font-medium text-gray-700">Ind.</th>
                    <th className="text-center py-3 md:py-2 px-2 md:px-1 font-medium text-gray-700">Vágány</th>
                  </tr>
                </thead>
                <tbody>
                  {trainDetails.route.map((stop, index) => {
                    const isPassed = stop.isPassed || false;
                    
                    return (
                      <tr 
                        key={index} 
                        className={`border-b border-gray-100 ${isPassed ? 'text-gray-500' : ''} hover:bg-gray-50`}
                      >
                        <td className="py-4 md:py-2 px-2 md:px-1 font-medium">
                          {stop.station.name}
                        </td>
                        <td className="text-center py-4 md:py-2 px-2 md:px-1">
                          {stop.arrival ? (
                            <div className="flex flex-col items-center">
                              <span className={isPassed ? 'line-through' : ''}>
                                {formatTime(new Date(stop.arrival))}
                              </span>
                              {stop.actualArrival && formatTime(new Date(stop.actualArrival)) !== formatTime(new Date(stop.arrival)) && (
                                <span className={`${stop.delay && stop.delay > 0 ? 'text-red-600' : 'text-green-600'} text-sm md:text-xs`}>
                                  {formatTime(new Date(stop.actualArrival))}
                                </span>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="text-center py-4 md:py-2 px-2 md:px-1">
                          {stop.departure ? (
                            <div className="flex flex-col items-center">
                              <span className={isPassed ? 'line-through' : ''}>
                                {formatTime(new Date(stop.departure))}
                              </span>
                              {stop.actualDeparture && formatTime(new Date(stop.actualDeparture)) !== formatTime(new Date(stop.departure)) && (
                                <span className={`${stop.delay && stop.delay > 0 ? 'text-red-600' : 'text-green-600'} text-sm md:text-xs`}>
                                  {formatTime(new Date(stop.actualDeparture))}
                                </span>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="text-center py-4 md:py-2 px-2 md:px-1">
                          {stop.platform ? (
                            <span className="bg-blue-100 text-blue-800 px-3 py-2 md:px-2 md:py-1 rounded text-sm md:text-xs font-medium">
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
          <div className="text-center py-8 md:py-4 text-gray-600">
            <div className="text-base md:text-sm">További vonatrészletek nem elérhetőek</div>
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