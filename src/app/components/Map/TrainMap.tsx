'use client';

import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore, useLocationStore } from '@/lib/store';
import { useTrains } from '@/lib/hooks/useTrains';
import { TrainInfoCard } from '../Train/TrainInfoCard';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { DelayLegend } from '../UI/DelayLegend';
import { LocationButton } from '../UI/LocationButton';
import { Train, DelayCategory } from '@/types';
import { getDelayCategory, getDelayColor } from '@/lib/utils';
// --- ADDED: Import RefreshCw icon and cn utility ---
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// Set Mapbox access token - hardcoded based on environment
const isDev = process.env.NODE_ENV === 'development';
const MAPBOX_TOKEN = isDev 
  ? 'pk.eyJ1IjoiYXJvbmx1a2FjcyIsImEiOiJjbWNmY3dzYTEwODJsMm1xeDRjcWlqNDM1In0.dp1ZMJivifhXprb0bzprTQ' // dev token
  : 'pk.eyJ1IjoiYXJvbmx1a2FjcyIsImEiOiJjbWM4eTZyOXAweW5uMmtzM3hmanhtNzlxIn0.iZgLUL05MUWcOI_03e1EFA'; // production/staging token

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

function TrainMapComponent() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [showRailwayOverlay, setShowRailwayOverlay] = useState(true);
  
  const { selectedTrain, focusedTrain, setSelectedTrain, setFocusedTrain, setBounds } = useMapStore();
  // --- CHANGED: Destructure `isFetching` and `refetch` from the useTrains hook ---
  const { data: trains, isLoading, isFetching, error, refetch } = useTrains();
  
  // Location store hooks
  const { userLocation, isCentered, setIsCentered } = useLocationStore();
  const [isInitialLocationSet, setIsInitialLocationSet] = useState(false);

  console.log('TrainMap render:', { 
    hasToken: !!MAPBOX_TOKEN, 
    mapReady, 
    trainsCount: trains?.length,
    mapError,
    mapCenter: map.current ? [map.current.getCenter().lng, map.current.getCenter().lat] : null,
    sampleTrainPositions: trains?.slice(0, 3).map(t => [t.position.longitude, t.position.latitude])
  });

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    console.log('Initializing map with token:', !!MAPBOX_TOKEN);

    try {
      // Initialize map centered on Hungary
      const initialCenter: [number, number] = [19.0408, 47.4979]; // Budapest coordinates [lng, lat]
      const initialZoom = 7;
      
      console.log('🗺️ Initializing map with center:', initialCenter, 'zoom:', initialZoom);
      
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: initialCenter,
        zoom: initialZoom,
        // Explicitly set coordinate system - Mapbox uses Web Mercator internally
        projection: { name: 'mercator' },
        // Ensure we're using the standard coordinate reference system
        transformRequest: (url, resourceType) => {
          console.log(`🗺️ Map requesting: ${resourceType} from ${url}`);
          return { url };
        }
      });

      map.current.on('load', () => {
        console.log('Map loaded successfully');
        
        // Add OpenRailwayMap overlay for railway tracks
        map.current!.addSource('railway-tiles', {
          type: 'raster',
          tiles: [
            'https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
        });

        map.current!.addLayer({
          id: 'railway-overlay',
          type: 'raster',
          source: 'railway-tiles',
          paint: {
            'raster-opacity': 0.7
          }
        });

        
        setMapReady(true);
      });

      map.current.on('error', (e) => {
        console.error('Map error:', e);
        setMapError('Nem sikerült betölteni a térképet');
      });

      // Use a debounced bounds update to prevent excessive re-renders
      let boundsTimeout: NodeJS.Timeout;
      map.current.on('moveend', () => {
        if (!map.current) return;
        clearTimeout(boundsTimeout);
        boundsTimeout = setTimeout(() => {
          const bounds = map.current?.getBounds();
          if (bounds) {
            const newBounds = {
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest(),
            };
            
            console.log('📍 Map bounds updated:', newBounds);
            
            // Validate bounds are reasonable (roughly around Hungary/Europe)
            if (newBounds.north >= 40 && newBounds.north <= 55 && 
                newBounds.south >= 40 && newBounds.south <= 55 &&
                newBounds.south < newBounds.north &&
                newBounds.east >= 10 && newBounds.east <= 30 &&
                newBounds.west >= 10 && newBounds.west <= 30 &&
                newBounds.west < newBounds.east) {
              setBounds(newBounds);
            } else {
              console.warn('🚨 Invalid bounds detected, skipping update:', newBounds);
              // Auto-correct map to Hungary if bounds go crazy
              console.log('🔧 Auto-correcting map to Hungary bounds');
              map.current?.easeTo({
                center: [19.0408, 47.4979], // Budapest
                zoom: 7,
                duration: 1000
              });
            }
          }
        }, 100);
      });

    } catch (error) {
      console.error('Error initializing map:', error);
      setMapError('Nem sikerült inicializálni a térképet');
    }

    return () => {
      console.log('Cleaning up map');
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once

  // Memoize train colors to prevent flickering
  const trainColorsCache = useRef<Map<string, { delay: number, color: string, category: DelayCategory }>>(new Map());
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize expensive GeoJSON features creation
  const geoJsonFeatures = useMemo(() => {
    if (!trains) return [];
    
    return trains
      .filter(train => {
        const coords = [train.position.longitude, train.position.latitude];
        // Validate coordinates are reasonable for Hungary
        return !(Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90 ||
                coords[1] < 45.5 || coords[1] > 48.7 ||
                coords[0] < 16.0 || coords[0] > 23.0);
      })
      .map(train => {
        // Stable delay calculation to prevent flickering
        const stableDelay = Math.round(train.delay);
        
        // Use memoized color calculation to prevent flickering
        let cachedColor = trainColorsCache.current.get(train.id);
        if (!cachedColor || cachedColor.delay !== stableDelay) {
          const delayCategory = getDelayCategory(stableDelay);
          const color = getDelayColor(delayCategory);
          cachedColor = { delay: stableDelay, color, category: delayCategory };
          trainColorsCache.current.set(train.id, cachedColor);
        }
        
        return {
          type: 'Feature' as const,
          properties: {
            id: train.id,
            number: train.number,
            delay: stableDelay,
            destination: train.destination?.name || 'Unknown',
            color: cachedColor.color,
            heading: train.heading || 0,
            headingRaw: train.heading || 0,
            delayCategory: cachedColor.category
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [train.position.longitude, train.position.latitude]
          }
        };
      });
  }, [trains]);

  // Update train positions using GeoJSON layer instead of individual markers
  useEffect(() => {
    if (!map.current || !geoJsonFeatures.length || !mapReady) return;

    // Debounce rapid updates during zoom/pan operations
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(() => {
    // Use the memoized features
    const features = geoJsonFeatures;

    const geojson = {
      type: 'FeatureCollection' as const,
      features
    };

    // Clean up cache for trains that no longer exist
    if (trains) {
      const activeTrainIds = new Set(trains.map(t => t.id));
      for (const cachedTrainId of trainColorsCache.current.keys()) {
        if (!activeTrainIds.has(cachedTrainId)) {
          trainColorsCache.current.delete(cachedTrainId);
        }
      }
    }

    console.log(`🗺️ Updating GeoJSON layer with ${features.length} train features`);
    
    // Check if source exists, if so just update the data
    if (map.current && map.current.getSource('trains')) {
      // Just update the data, more efficient than recreating layers
      const source = map.current.getSource('trains') as mapboxgl.GeoJSONSource;
      source.setData(geojson);
    } else if (map.current) {
      // First time - create source and layers
      map.current.addSource('trains', {
        type: 'geojson',
        data: geojson
      });

      // Holavonat-style: Triangles behind circles with dynamic directional offset
      map.current.addLayer({
        id: 'train-arrows',
        type: 'symbol',
        source: 'trains',
        layout: {
          'text-field': '▲',
          'text-size': 27, // Large enough so circle covers base, tip extends out
          'text-rotate': ['get', 'heading'],
          'text-rotation-alignment': 'map',
          'text-keep-upright': false,
          // Dynamic offset: position triangle so tip extends in direction of travel
          // More interpolation points for smoother positioning
          'text-offset': [
            'interpolate', ['linear'], ['get', 'heading'],
            0,   ['literal', [0, -0.3]],     // North
            45,  ['literal', [0.3, -0.3]], // Northeast  
            90,  ['literal', [0.3, 0]],      // East
            135, ['literal', [0.3, 0.3]],  // Southeast
            180, ['literal', [0, 0.3]],      // South
            225, ['literal', [-0.3, 0.3]], // Southwest
            270, ['literal', [-0.3, 0]],     // West
            315, ['literal', [-0.3, -0.3]], // Northwest
            360, ['literal', [0, -0.3]]      // North (wrap around)
          ],
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': '#374151',
          'text-halo-width': 1.25
        }
      });

      // Circles on top to cover triangle bases
      map.current.addLayer({
        id: 'trains',
        type: 'circle',
        source: 'trains',
        paint: {
          'circle-radius': 8, // Covers triangle base, lets tip extend
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#374151'
        }
      });

      // Add pointer cursor on hover
      map.current.on('mouseenter', 'trains', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'trains', () => {
        map.current!.getCanvas().style.cursor = '';
      });
      map.current.on('mouseenter', 'train-arrows', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'train-arrows', () => {
        map.current!.getCanvas().style.cursor = '';
      });

      // Add click handlers for both layers
      const handleTrainClick = (e: any) => {
        if (e.features && e.features[0]) {
          const feature = e.features[0];
          const trainId = feature.properties?.id;
          const train = trains?.find(t => t.id === trainId);
          if (train) {
            setSelectedTrain(train);
          }
        }
      };
      
      map.current.on('click', 'trains', handleTrainClick);
      map.current.on('click', 'train-arrows', handleTrainClick);
    }

    // Debug coordinate and delay analysis
    if (features.length > 0) {
      console.log('🔍 GeoJSON analysis:');
      const coords = features.slice(0, 5).map(f => f.geometry.coordinates);
      console.log('  Sample coordinates:', coords);
      
      const allLats = features.map(f => f.geometry.coordinates[1]);
      const allLngs = features.map(f => f.geometry.coordinates[0]);
      const avgLat = allLats.reduce((a, b) => a + b, 0) / allLats.length;
      const avgLng = allLngs.reduce((a, b) => a + b, 0) / allLngs.length;
      console.log('  Average coords:', { lat: avgLat, lng: avgLng });
      
      // Debug delay distribution (aligned with main delay categories)
      const delays = features.map(f => f.properties.delay);
      const delayBuckets = {
        onTime: delays.filter(d => d <= 4).length,        // 0-4 perc késés
        minor: delays.filter(d => d >= 5 && d <= 19).length,      // 5-19 perc késés
        moderate: delays.filter(d => d >= 20 && d <= 59).length,  // 20-59 perc késés
        severe: delays.filter(d => d >= 60).length                // 60+ perc késés
      };
      console.log('  Delay distribution:', delayBuckets);
      console.log('  Sample delays:', delays.slice(0, 10));
      
      // Debug colors and enhanced info
      const colors = features.slice(0, 10).map(f => ({ 
        train: f.properties.number, 
        delay: f.properties.delay, 
        color: f.properties.color,
        heading: f.properties.heading, // Add heading to debug output
        gtfsId: trains?.find(t => t.number === f.properties.number)?.gtfsId,
        speed: trains?.find(t => t.number === f.properties.number)?.speed,
        isMoving: trains?.find(t => t.number === f.properties.number)?.isMoving
      }));
      console.log('  Sample train details:', colors);
      
      // Debug heading values specifically
      const headings = features.map(f => ({ 
        train: f.properties.number,
        heading: f.properties.heading,
        gtfsId: trains?.find(t => t.number === f.properties.number)?.gtfsId
      }));
      console.log('  🧭 Train headings:', headings.slice(0, 10));
      
      // Debug specific problematic train
      const problematicTrain = trains?.find(t => t.gtfsId === '1:24892393.22206360');
      if (problematicTrain) {
        console.log('🚨 Problematic train found:', {
          number: problematicTrain.number,
          heading: problematicTrain.heading,
          gtfsId: problematicTrain.gtfsId,
          position: problematicTrain.position
        });
      }
      
      // Show which trains have real delay data
      const trainsWithRealDelay = features.filter(f => f.properties.delay > 0);
      console.log(`  🚨 Trains with delays: ${trainsWithRealDelay.length}/${features.length}`);
      if (trainsWithRealDelay.length > 0) {
        console.log('  Delayed trains:', trainsWithRealDelay.map(f => ({
          number: f.properties.number,
          delay: f.properties.delay,
          destination: f.properties.destination
        })));
      }
    }

    }, 100); // 100ms debounce to prevent rapid updates during zoom

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [geoJsonFeatures, trains, setSelectedTrain, mapReady]);

  // Toggle railway overlay
  useEffect(() => {
    if (!map.current || !mapReady) return;
    
    const layerId = 'railway-overlay';
    if (map.current.getLayer(layerId)) {
      map.current.setLayoutProperty(layerId, 'visibility', showRailwayOverlay ? 'visible' : 'none');
    }
  }, [showRailwayOverlay, mapReady]);

  // Handle user location and marker
  useEffect(() => {
    if (!map.current || !mapReady) return;

    const mapInstance = map.current;

    // Add or update the user location marker
    const source = mapInstance.getSource('user-location-source') as mapboxgl.GeoJSONSource;
    const geojson = {
      type: 'FeatureCollection' as const,
      features: userLocation ? [{
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [userLocation.longitude, userLocation.latitude],
        },
        properties: {},
      }] : [],
    };

    if (source) {
      source.setData(geojson);
    } else {
      mapInstance.addSource('user-location-source', { type: 'geojson', data: geojson });

      // Add the pulsing ring layer
      mapInstance.addLayer({
        id: 'user-location-pulse-layer',
        type: 'circle',
        source: 'user-location-source',
        paint: {
          'circle-radius': 10,
          'circle-color': '#007cff',
          'circle-opacity': 0.5,
        },
      });

      // Add the solid dot layer on top
      mapInstance.addLayer({
        id: 'user-location-dot-layer',
        type: 'circle',
        source: 'user-location-source',
        paint: {
          'circle-radius': 6,
          'circle-color': '#007cff',
          'circle-stroke-color': 'white',
          'circle-stroke-width': 2,
        },
      });
    }

    // Handle the initial pan/zoom
    if (userLocation && !isInitialLocationSet) {
      mapInstance.easeTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 12, // City-level zoom, not too deep
        duration: 2000,
      });
      setIsInitialLocationSet(true);
      setIsCentered(true);
    }
    
    // Handle manual re-centering via the button
    if (userLocation && isCentered && isInitialLocationSet) {
      mapInstance.easeTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: Math.max(mapInstance.getZoom(), 12), // Don't zoom out if already zoomed in
        duration: 1500,
      });
    }

  }, [userLocation, mapReady, isInitialLocationSet, isCentered, setIsCentered]);

  // Handle focused train - zoom to it and clear the focused state
  useEffect(() => {
    if (!map.current || !mapReady || !focusedTrain) return;

    console.log('🎯 Focusing on train:', focusedTrain.number, 'at position:', [focusedTrain.position.longitude, focusedTrain.position.latitude]);
    
    // Zoom to the train's position with high zoom level
    map.current.easeTo({
      center: [focusedTrain.position.longitude, focusedTrain.position.latitude],
      zoom: 14, // High zoom level to focus on the train
      duration: 1500 // Smooth animation
    });

    // Clear the focused train after animation
    setTimeout(() => {
      setFocusedTrain(null);
    }, 1500);
  }, [focusedTrain, mapReady, setFocusedTrain]);

  // Memoized helper function to create train marker element
  const createTrainMarker = useCallback((train: Train, color: string): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'train-marker';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = color;
    el.style.border = '2px solid white';
    el.style.cursor = 'pointer';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    
    // Add direction indicator
    const arrow = document.createElement('div');
    arrow.style.width = '0';
    arrow.style.height = '0';
    arrow.style.borderLeft = '4px solid transparent';
    arrow.style.borderRight = '4px solid transparent';
    arrow.style.borderBottom = `8px solid ${color}`;
    arrow.style.position = 'absolute';
    arrow.style.top = '-10px';
    arrow.style.left = '50%';
    arrow.style.transform = `translateX(-50%) rotate(${train.heading}deg)`;
    arrow.style.transformOrigin = 'bottom center';
    
    el.appendChild(arrow);
    el.style.position = 'relative';
    
    return el;
  }, []); // No dependencies needed since it only uses pure DOM operations

  if (!mapboxgl.accessToken) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-gray-600 mb-2">A térkép nem tölthető be</p>
          <p className="text-sm text-gray-500">Állítsd be a NEXT_PUBLIC_MAPBOX_TOKEN-t</p>
          <p className="text-xs text-gray-400 mt-2">Token találva: {!!MAPBOX_TOKEN ? 'Igen' : 'Nem'}</p>
        </div>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-red-600 mb-2">{mapError}</p>
          <p className="text-sm text-gray-500">Nézd meg a konzolt a részletekért</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Train info popup */}
      {selectedTrain && (
        <div className="absolute top-4 right-4 z-50">
          <TrainInfoCard 
            train={selectedTrain} 
            onClose={() => setSelectedTrain(null)} 
          />
        </div>
      )}


      {/* Delay Legend */}
      <div className="absolute bottom-4 left-4 z-10">
        <DelayLegend />
      </div>

      {/* --- UPDATED: UI Controls Wrapper - Now Vertical --- */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* Top row: Railway and Refresh buttons */}
        <div className="flex items-center gap-2">
          {/* Railway Overlay Toggle */}
          <button
            onClick={() => setShowRailwayOverlay(!showRailwayOverlay)}
            className={cn(
              'px-3 py-2 rounded-lg shadow-md text-sm font-medium transition-colors',
              showRailwayOverlay 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
            )}
          >
            🚂 Vasúti pályák
          </button>

          {/* --- ADDED: Manual Refresh Button --- */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 rounded-lg shadow-md hover:bg-gray-50 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
            title="Vonatadatok frissítése"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            <span className="text-sm font-medium">
              {isFetching ? 'Frissítés...' : 'Frissítés'}
            </span>
          </button>
        </div>

        {/* Bottom row: Location Button */}
        <div className="flex justify-start">
          <LocationButton />
        </div>
      </div>
      
      {/* --- UPDATED: Use `isLoading` for the initial load message --- */}
      {/* This only shows on the very first load, not on background refreshes */}
      {isLoading && !trains && (
        <div className="absolute top-16 left-4 bg-white rounded-lg shadow-md p-3">
          <div className="flex items-center gap-2">
            <LoadingSpinner size="sm" />
            <span className="text-sm">Kezdeti vonatadatok betöltése...</span>
          </div>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="absolute bottom-4 left-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Nem sikerült betölteni a vonatadatokat
        </div>
      )}
    </div>
  );
}

// Memoize the component since it has no props and expensive operations
export const TrainMap = memo(TrainMapComponent);