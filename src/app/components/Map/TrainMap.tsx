'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore } from '@/lib/store';
import { useTrains } from '@/lib/hooks/useTrains';
import { TrainInfoCard } from '../Train/TrainInfoCard';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { DelayLegend } from '../UI/DelayLegend';
import { Train, DelayCategory } from '@/types';
import { getDelayCategory, getDelayColor } from '@/lib/utils';

// Set Mapbox access token
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

export function TrainMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [showRailwayOverlay, setShowRailwayOverlay] = useState(true);
  
  const { center, zoom, selectedTrain, setSelectedTrain, setBounds } = useMapStore();
  const { data: trains, isLoading, error } = useTrains();

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
      const initialCenter = [19.0408, 47.4979]; // Budapest coordinates [lng, lat]
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

        // Add test markers at known Hungarian cities to verify coordinate system
        const cities = [
          { name: 'Budapest', coords: [19.0408, 47.4979], color: 'red' },
          { name: 'Debrecen', coords: [21.6273, 47.5316], color: 'blue' },
          { name: 'Szeged', coords: [20.1414, 46.2530], color: 'green' },
          { name: 'Pécs', coords: [18.2323, 46.0727], color: 'purple' }
        ];
        
        cities.forEach(city => {
          const testMarker = new mapboxgl.Marker({ color: city.color })
            .setLngLat(city.coords)
            .addTo(map.current!);
          console.log(`🎯 Test marker added at ${city.name}: [${city.coords[0]}, ${city.coords[1]}]`);
        });
        
        setMapReady(true);
      });

      map.current.on('error', (e) => {
        console.error('Map error:', e);
        setMapError('Failed to load map');
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
      setMapError('Failed to initialize map');
    }

    return () => {
      console.log('Cleaning up map');
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapReady(false);
    };
  }, []); // Empty dependency array - only run once

  // Memoize train colors to prevent flickering
  const trainColorsCache = useRef<Map<string, { delay: number, color: string, category: DelayCategory }>>(new Map());
  const updateTimeoutRef = useRef<NodeJS.Timeout>();

  // Update train positions using GeoJSON layer instead of individual markers
  useEffect(() => {
    if (!map.current || !trains || !mapReady) return;

    // Debounce rapid updates during zoom/pan operations
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(() => {

    // Create stable train signature for change detection
    const currentTrainIds = trains.map(t => {
      // Round delay to nearest minute to prevent micro-changes causing flickering
      const stableDelay = Math.round(t.delay);
      // Round coordinates to 4 decimal places for stability
      const stableLat = Math.round(t.position.latitude * 10000) / 10000;
      const stableLng = Math.round(t.position.longitude * 10000) / 10000;
      return `${t.id}-${stableDelay}-${stableLat}-${stableLng}`;
    }).sort().join(',');
    
    const lastUpdateRef = map.current._vonatterkeepLastUpdate;
    if (lastUpdateRef === currentTrainIds) {
      return; // No meaningful changes, skip update
    }
    map.current._vonatterkeepLastUpdate = currentTrainIds;

    // Create GeoJSON feature collection from trains
    const features = trains
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
            delayCategory: cachedColor.category // Store for consistent coloring
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [train.position.longitude, train.position.latitude]
          }
        };
      });

    const geojson = {
      type: 'FeatureCollection' as const,
      features
    };

    // Clean up cache for trains that no longer exist
    const activeTrainIds = new Set(trains.map(t => t.id));
    for (const cachedTrainId of trainColorsCache.current.keys()) {
      if (!activeTrainIds.has(cachedTrainId)) {
        trainColorsCache.current.delete(cachedTrainId);
      }
    }

    console.log(`🗺️ Updating GeoJSON layer with ${features.length} train features`);
    
    // Check if source exists, if so just update the data
    if (map.current.getSource('trains')) {
      // Just update the data, more efficient than recreating layers
      const source = map.current.getSource('trains') as mapboxgl.GeoJSONSource;
      source.setData(geojson);
    } else {
      // First time - create source and layers
      map.current.addSource('trains', {
        type: 'geojson',
        data: geojson
      });

      // Add train circles
      map.current.addLayer({
        id: 'trains',
        type: 'circle',
        source: 'trains',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Add train direction arrows using text symbols (Unicode triangle)
      map.current.addLayer({
        id: 'train-arrows',
        type: 'symbol',
        source: 'trains',
        layout: {
          'text-field': '▲', // Unicode triangle
          'text-size': 12,
          'text-rotate': ['get', 'heading'],
          'text-rotation-alignment': 'map',
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': ['get', 'color'],
          'text-halo-width': 1
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
          const train = trains.find(t => t.id === trainId);
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
      
      // Debug delay distribution
      const delays = features.map(f => f.properties.delay);
      const delayBuckets = {
        onTime: delays.filter(d => d < 5).length,
        minor: delays.filter(d => d >= 5 && d < 15).length,
        moderate: delays.filter(d => d >= 15 && d < 30).length,
        severe: delays.filter(d => d >= 30).length
      };
      console.log('  Delay distribution:', delayBuckets);
      console.log('  Sample delays:', delays.slice(0, 10));
      
      // Debug colors and enhanced info
      const colors = features.slice(0, 10).map(f => ({ 
        train: f.properties.number, 
        delay: f.properties.delay, 
        color: f.properties.color,
        gtfsId: trains.find(t => t.number === f.properties.number)?.gtfsId,
        speed: trains.find(t => t.number === f.properties.number)?.speed,
        isMoving: trains.find(t => t.number === f.properties.number)?.isMoving
      }));
      console.log('  Sample train details:', colors);
      
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
  }, [trains, setSelectedTrain, mapReady]);

  // Toggle railway overlay
  useEffect(() => {
    if (!map.current || !mapReady) return;
    
    const layerId = 'railway-overlay';
    if (map.current.getLayer(layerId)) {
      map.current.setLayoutProperty(layerId, 'visibility', showRailwayOverlay ? 'visible' : 'none');
    }
  }, [showRailwayOverlay, mapReady]);

  // Helper function to create train marker element
  function createTrainMarker(train: Train, color: string): HTMLElement {
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
  }

  if (!mapboxgl.accessToken) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-gray-600 mb-2">Map cannot be loaded</p>
          <p className="text-sm text-gray-500">Please configure NEXT_PUBLIC_MAPBOX_TOKEN</p>
          <p className="text-xs text-gray-400 mt-2">Token found: {!!MAPBOX_TOKEN ? 'Yes' : 'No'}</p>
        </div>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-red-600 mb-2">{mapError}</p>
          <p className="text-sm text-gray-500">Check console for details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Train info popup */}
      {selectedTrain && (
        <div className="absolute top-4 right-4 z-10">
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

      {/* Railway Overlay Toggle */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => setShowRailwayOverlay(!showRailwayOverlay)}
          className={`px-3 py-2 rounded-lg shadow-md text-sm font-medium transition-colors ${
            showRailwayOverlay 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          🚂 Railway Tracks
        </button>
      </div>
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-16 left-4 bg-white rounded-lg shadow-md p-3">
          <div className="flex items-center gap-2">
            <LoadingSpinner size="sm" />
            <span className="text-sm">Loading trains...</span>
          </div>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="absolute bottom-4 left-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Failed to load train data
        </div>
      )}
    </div>
  );
}