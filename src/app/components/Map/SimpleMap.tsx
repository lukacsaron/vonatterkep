'use client';

import { useTrains } from '@/lib/hooks/useTrains';
import { useMapStore } from '@/lib/store';
import { TrainInfoModal } from '../Train/TrainInfoModal';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { getDelayColor, getDelayCategory } from '@/lib/utils';
import { Train } from '@/types';

export function SimpleMap() {
  const { selectedTrain, setSelectedTrain } = useMapStore();
  const { data: trains, isLoading, error } = useTrains();
  
  // This is the fallback map component (used when Mapbox token is not available)
  console.log('SimpleMap: Rendering fallback map component (no Mapbox token)');

  const handleTrainClick = (train: Train) => {
    setSelectedTrain(train);
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-red-600 mb-2">Nem sikerült betölteni a vonatadatokat</p>
          <p className="text-sm text-gray-500">Ellenőrizd a kapcsolatot és próbáld újra</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-green-100 to-blue-100">
      {/* Simple map background */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            radial-gradient(circle at 47.5% 19.1%, rgba(59, 130, 246, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 47.5% 21.6%, rgba(34, 197, 94, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 46.1% 18.2%, rgba(168, 85, 247, 0.3) 0%, transparent 50%)
          `,
        }}
      />
      
      {/* Hungary outline suggestion */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-6xl text-gray-300 font-bold">🇭🇺</div>
      </div>

      {/* Train positions */}
      <div className="relative z-10 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trains?.map((train) => {
            const color = getDelayColor(getDelayCategory(train.delay));
            return (
              <div
                key={train.id}
                onClick={() => handleTrainClick(train)}
                className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Vonat {train.number}</h3>
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </div>
                <p className="text-sm text-gray-600 mb-1">
                  → {train.destination?.name || 'Ismeretlen'}
                </p>
                <p className="text-sm text-gray-500">
                  Következő: {train.nextStation?.name || 'Ismeretlen'}
                </p>
                <p className="text-sm font-medium mt-2">
                  {Math.round(train.speed)} km/h
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Train info popup */}
      <TrainInfoModal 
        train={selectedTrain} 
        onClose={() => setSelectedTrain(null)} 
      />

      {/* Info banner */}
      <div className="absolute bottom-4 left-4 bg-blue-100 border border-blue-300 text-blue-800 px-4 py-2 rounded">
        <p className="text-sm">
          📍 {trains?.length || 0} vonat megjelenítve • Adj hozzá NEXT_PUBLIC_MAPBOX_TOKEN-t interaktív térképhez
        </p>
      </div>
    </div>
  );
}