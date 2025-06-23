'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../UI/LoadingSpinner';

// Dynamically import both map components
const TrainMap = dynamic(() => import('./TrainMap').then(mod => mod.TrainMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <LoadingSpinner size="lg" />
    </div>
  )
});

const SimpleMap = dynamic(() => import('./SimpleMap').then(mod => mod.SimpleMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <LoadingSpinner size="lg" />
    </div>
  )
});

export function MapSelector() {
  const [hasMapboxToken, setHasMapboxToken] = useState<boolean | null>(null);

  useEffect(() => {
    // Hardcoded Mapbox token
    const token = 'pk.eyJ1IjoiYXJvbmx1a2FjcyIsImEiOiJjbWM4eTZyOXAweW5uMmtzM3hmanhtNzlxIn0.iZgLUL05MUWcOI_03e1EFA';
    const hasToken = Boolean(token);
    
    console.log('MapSelector - hardcoded token check:', hasToken, 'token:', token?.substring(0, 10) + '...');
    setHasMapboxToken(hasToken);
  }, []);

  // Show loading while determining which map to use
  if (hasMapboxToken === null) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Render appropriate map component
  if (hasMapboxToken) {
    console.log('MapSelector: Loading TrainMap (interactive)');
    return <TrainMap />;
  } else {
    console.log('MapSelector: Loading SimpleMap (fallback)');
    return <SimpleMap />;
  }
}