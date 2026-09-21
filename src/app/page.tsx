'use client';

import { useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/app/components/UI/Navbar';
import { LoadingSpinner } from '@/app/components/UI/LoadingSpinner';
import { MapSelector } from '@/app/components/Map/MapSelector';
import { useMapStore } from '@/lib/store';
import { useTrains } from '@/lib/hooks/useTrains';
import { getDataFreshness } from '@/lib/dataFreshness';
import { StaleDataBanner } from '@/app/components/UI/StaleDataBanner';

function HomeContent() {
  const searchParams = useSearchParams();
  const { data: trains } = useTrains();
  // Select the two actions rather than the whole store: subscribing to the
  // store re-rendered this page shell on every map pan.
  const setSelectedTrain = useMapStore(state => state.setSelectedTrain);
  const setFocusedTrain = useMapStore(state => state.setFocusedTrain);
  const freshness = useMemo(() => getDataFreshness(trains), [trains]);

  useEffect(() => {
    const trainParam = searchParams.get('train');
    if (trainParam && trains) {
      // ?train= may carry the train number or its ElviraID (station board links).
      const train = trains.find(t => t.id === trainParam || t.gtfsId === trainParam);
      if (train) {
        setSelectedTrain(train);
        setFocusedTrain(train);
      }
    }
  }, [searchParams, trains, setSelectedTrain, setFocusedTrain]);

  return (
    <div className="flex flex-col h-screen bg-white">
      <Navbar />
      <main className="flex-1 relative bg-gray-50">
        <h1 className="sr-only">VasútTérkép – élő vonatkövetés Magyarországon</h1>
        <StaleDataBanner freshness={freshness} />
        <MapSelector />
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-screen bg-white">
        <Navbar />
        <main className="flex-1 relative bg-gray-50 flex items-center justify-center">
          <h1 className="sr-only">VasútTérkép – élő vonatkövetés Magyarországon</h1>
          <LoadingSpinner size="lg" />
        </main>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}