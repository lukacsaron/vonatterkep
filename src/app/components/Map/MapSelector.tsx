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
    // Use environment variable instead of hardcoded token
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const hasToken = Boolean(token);
    
    console.log('MapSelector - environment token check:', hasToken, 'token:', token?.substring(0, 10) + '...');
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