'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/app/components/UI/Navbar';
import { LoadingSpinner } from '@/app/components/UI/LoadingSpinner';
import { useMapStore } from '@/lib/store';
import { useTrains } from '@/lib/hooks/useTrains';

// Check if Mapbox token is available and use appropriate map component
const hasMapboxToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
console.log('Page render - hasMapboxToken:', hasMapboxToken, 'token:', process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.substring(0, 10) + '...');

const MapComponent = dynamic(
  () => {
    console.log('Dynamic import - using TrainMap:', hasMapboxToken);
    if (hasMapboxToken) {
      return import('@/app/components/Map/TrainMap').then(mod => mod.TrainMap);
    } else {
      return import('@/app/components/Map/SimpleMap').then(mod => mod.SimpleMap);
    }
  },
  { 
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <LoadingSpinner size="lg" />
      </div>
    ),
    ssr: false 
  }
);

export default function Home() {
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
        <MapComponent />
      </main>
    </div>
  );
}