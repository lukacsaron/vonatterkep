'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../UI/LoadingSpinner';

// Inlined by Next.js at build time. There is deliberately no fallback token in the
// source: production gets its (URL-restricted) token from the build environment.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function MapPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <LoadingSpinner size="lg" />
    </div>
  );
}

const TrainMap = dynamic(() => import('./TrainMap').then(mod => mod.TrainMap), {
  ssr: false,
  loading: MapPlaceholder,
});

function MissingTokenMessage() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 p-6">
      <div role="alert" className="max-w-md bg-white rounded-lg shadow-md p-6 text-center">
        <p className="text-lg font-semibold text-gray-900 mb-2">
          A térkép most nem érhető el
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Hiányzik a térképszolgáltatás beállítása, ezért nem tudjuk megjeleníteni a vonatokat.
          Kérjük, nézz vissza egy kicsit később.
        </p>
        <p className="text-xs text-gray-400">
          Üzemeltetőknek: a <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> környezeti változót a build
          idején kell megadni.
        </p>
      </div>
    </div>
  );
}

export function MapSelector() {
  // Mount the map - and so start downloading the ~400 KiB mapbox-gl chunk - after
  // the first paint, as the previous token check in an effect did, so the page's
  // own fonts and text are not competing with it for bandwidth.
  const [afterFirstPaint, setAfterFirstPaint] = useState(false);
  useEffect(() => {
    setAfterFirstPaint(true);
  }, []);

  if (!MAPBOX_TOKEN) {
    return <MissingTokenMessage />;
  }
  if (!afterFirstPaint) {
    return <MapPlaceholder />;
  }
  return <TrainMap accessToken={MAPBOX_TOKEN} />;
}
