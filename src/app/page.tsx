'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/app/components/UI/Navbar';
import { LoadingSpinner } from '@/app/components/UI/LoadingSpinner';
import { MapSelector } from '@/app/components/Map/MapSelector';
import { useMapStore } from '@/lib/store';
import { useTrains } from '@/lib/hooks/useTrains';

function HomeContent() {
  const searchParams = useSearchParams();
  const { data: trains } = useTrains();
  const { setSelectedTrain, setFocusedTrain } = useMapStore();

  useEffect(() => {
    const trainParam = searchParams.get('train');
    if (trainParam && trains) {
      const train = trains.find(t => t.id === trainParam);
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
          <LoadingSpinner size="lg" />
        </main>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}