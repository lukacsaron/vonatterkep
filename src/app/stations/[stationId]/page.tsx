'use client';

import { useState, useEffect, useId } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { StationSearch } from '@/app/components/Station/StationSearch';
import { TimetableRow } from '@/app/components/Station/TimetableRow';
import { DatePicker } from '@/app/components/UI/DatePicker';
import { LoadingSpinner } from '@/app/components/UI/LoadingSpinner';
import { Navbar } from '@/app/components/UI/Navbar';
import { StyledTabsList, StyledTabsTrigger, StyledTabsContent, Tabs } from '@/app/components/UI/Tabs';
import { useTimetable } from '@/lib/hooks/useTrains';
import { useStations } from '@/lib/hooks/useStations';
import { LEGACY_STATION_NAMES } from '@/lib/gtfs/legacyStationIds';
import { Station, Departure } from '@/types';
import { cn } from '@/lib/utils';

interface StationTimetablePageProps {
  params: Promise<{
    stationId: string;
  }>;
}

export default function StationTimetablePage({ params }: StationTimetablePageProps) {
  const router = useRouter();
  const resolvedParams = useParams();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'departures' | 'arrivals'>('departures');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  
  // Get stationId from params. useParams() hands back the raw path segment, so
  // /stations/1%3A005510017 arrives still encoded; the API client encodes the
  // id again, which turned it into 1%253A... and the board 404'd.
  const rawStationId = Array.isArray(resolvedParams.stationId) ? resolvedParams.stationId[0] : resolvedParams.stationId;
  const stationId = rawStationId ? safeDecode(rawStationId) : rawStationId;
  const controlsId = useId();
  const stationInputId = `${controlsId}-station`;
  const tabsLabelId = `${controlsId}-tabs-label`;

  // Fetch station data to get the station name
  const { data: stations } = useStations('');
  
  // Fetch timetable data
  const { 
    data: timetableData, 
    isLoading, 
    error, 
    refetch,
    isFetching 
  } = useTimetable(stationId || null, activeTab, selectedDate);

  // Set selected station when stations data is available
  useEffect(() => {
    if (stations && stationId && !selectedStation) {
      const station = stations.find(s => s.id === stationId);
      if (station) {
        setSelectedStation(station);
      } else if (LEGACY_STATION_NAMES[stationId]) {
        // An id from an earlier version of the site: move to the GTFS id so
        // the name, map position and timetable all line up.
        const legacyName = LEGACY_STATION_NAMES[stationId];
        const current = stations.find(s => s.name === legacyName);
        if (current) router.replace(`/stations/${encodeURIComponent(current.id)}`);
      }
    }
  }, [stations, stationId, selectedStation, router]);

  // Handle station selection
  const handleStationSelect = (station: Station | null) => {
    if (station) {
      setSelectedStation(station);
      router.push(`/stations/${station.id}`);
    }
  };

  // Train rows link to the train on the map (there is no /trains/[id] page -
  // that route was a 404); the home page selects it from ?train=.
  const trainHref = (departure: Departure) => {
    const trainKey = departure.train.gtfsId || departure.train.number;
    return trainKey ? `/?train=${encodeURIComponent(trainKey)}` : undefined;
  };

  // Handle manual refresh
  const handleRefresh = () => {
    refetch();
  };

  // Loading state for initial load
  if (isLoading && !timetableData) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Nem sikerült betölteni a menetrendet
              </h2>
              <p className="text-gray-600 mb-4">
                Hiba történt az állomás menetrend betöltésekor. Próbáld újra.
              </p>
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Próbáld újra
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Állomás Menetrend
          </h1>
          <p className="text-gray-600">
            Valós idejű indulások és érkezések megtekintése
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'departures' | 'arrivals')}>
          {/* Controls */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="space-y-4">
              {/* Station Search */}
              <div>
                <label htmlFor={stationInputId} className="block text-sm font-medium text-gray-700 mb-2">
                  Állomás
                </label>
                <StationSearch
                  inputId={stationInputId}
                  value={selectedStation}
                  onSelect={handleStationSelect}
                  placeholder="Állomás keresése..."
                  className="w-full"
                />
              </div>

              {/* Date and Time Picker */}
              <div>
                <DatePicker
                  label="Dátum és Idő"
                  labelClassName="block text-sm font-medium text-gray-700 mb-2"
                  date={selectedDate}
                  onDateChange={setSelectedDate}
                  className="w-full"
                />
              </div>

              {/* Tabs for Departures/Arrivals */}
              <div>
                <div id={tabsLabelId} className="block text-sm font-medium text-gray-700 mb-2">
                  Menetrend Típusa
                </div>
                <StyledTabsList aria-labelledby={tabsLabelId}>
                  <StyledTabsTrigger value="departures">
                    Indulások
                  </StyledTabsTrigger>
                  <StyledTabsTrigger value="arrivals">
                    Érkezések
                  </StyledTabsTrigger>
                </StyledTabsList>
              </div>
            </div>
          </div>

          {/* Timetable Content: the tab panel the Indulások / Érkezések tabs control */}
          {(['departures', 'arrivals'] as const).map((tab) => (
            <StyledTabsContent
              key={tab}
              value={tab}
              // Both panels stay in the DOM so each tab's aria-controls resolves;
              // only the active one is shown and filled.
              forceMount
              hidden={activeTab !== tab}
              className="mt-0"
            >
              {activeTab === tab && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  {/* Header with refresh button */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {selectedStation?.name ? `${selectedStation.name} - ` : ''}
                      {activeTab === 'departures' ? 'Indulások' : 'Érkezések'}
                    </h2>
                    <button
                      onClick={handleRefresh}
                      disabled={isFetching}
                      className={cn(
                        'inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                      Frissítés
                    </button>
                  </div>

                  {/* Table Headers (Desktop only) */}
                  <div className="hidden sm:grid sm:grid-cols-12 sm:gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700" aria-hidden="true">
                    <div className="sm:col-span-2">Idő</div>
                    <div className="sm:col-span-4">
                      {activeTab === 'departures' ? 'Célállomás' : 'Indulás'}
                    </div>
                    <div className="sm:col-span-3">Vonat</div>
                    <div className="sm:col-span-1 text-center">Vágány</div>
                    <div className="sm:col-span-2 text-right">Állapot</div>
                  </div>

                  {/* Timetable Rows */}
                  <div className="divide-y divide-gray-100">
                    {timetableData && timetableData.length > 0 ? (
                      timetableData.map((departure, index) => (
                        <TimetableRow
                          key={`${departure.train.id}-${departure.time}-${index}`}
                          departure={departure}
                          type={activeTab}
                          href={trainHref(departure)}
                        />
                      ))
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        <p>Nincs {activeTab === 'departures' ? 'indulás' : 'érkezés'} a kiválasztott időpontban.</p>
                        <p className="text-sm mt-2">
                          Próbálj meg másik dátumot vagy időpontot választani.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Loading overlay for refresh */}
                  {isFetching && timetableData && (
                    <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
                      <LoadingSpinner />
                    </div>
                  )}
                </div>
              )}
            </StyledTabsContent>
          ))}

        </Tabs>

        {/* Auto-refresh indicator */}
        {timetableData && timetableData.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Automatikusan frissül 30 másodpercenként
          </div>
        )}
        </div>
      </main>
    </div>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
