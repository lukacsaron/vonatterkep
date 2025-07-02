'use client';

import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore, useLocationStore } from '@/lib/store';
import { useTrains, useTrainRoute } from '@/lib/hooks/useTrains';
import { TrainInfoModal } from '../Train/TrainInfoModal';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { DelayLegend } from '../UI/DelayLegend';
import { LocationButton } from '../UI/LocationButton';
import { Train, DelayCategory } from '@/types';
import { getDelayCategory, getDelayColor, decodePolyline, formatTime } from '@/lib/utils';
// --- ADDED: Import RefreshCw icon and cn utility ---
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// Set Mapbox access token - hardcoded for simplicity
mapboxgl.accessToken = 'pk.eyJ1IjoiYXJvbmx1a2FjcyIsImEiOiJjbWNmY3dzYTEwODJsMm1xeDRjcWlqNDM1In0.dp1ZMJivifhXprb0bzprTQ';

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
  // Hook for fetching train route details
  const { data: routeDetails } = useTrainRoute(selectedTrain?.gtfsId || null);
  
  // Location store hooks
  const { userLocation, isCentered, setIsCentered } = useLocationStore();
  const [isInitialLocationSet, setIsInitialLocationSet] = useState(false);

  console.log('TrainMap render:', { 
    mapReady, 
    trainsCount: trains?.length,
    mapError,
    mapCenter: map.current ? [map.current.getCenter().lng, map.current.getCenter().lat] : null,
    sampleTrainPositions: trains?.slice(0, 3).map(t => [t.position.longitude, t.position.latitude])
  });

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    console.log('Initializing map...');

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

  // Handle train route visualization
  useEffect(() => {
    if (!map.current || !mapReady) return;

    const mapInstance = map.current;

    // Clean up previous route layers
    const cleanupRouteLayers = () => {
      // Remove all route layers if they exist (enhanced layer system)
      [
        'route-line', 
        'route-stops-passed', 
        'route-stops-upcoming', 
        'route-stops-next', 
        'route-stop-labels',
        'route-stop-label-backgrounds',
        'route-stop-labels-primary',
        'route-stop-names',
        'route-stop-delay-indicators'
      ].forEach(layerId => {
        if (mapInstance.getLayer(layerId)) {
          mapInstance.removeLayer(layerId);
        }
      });
      // Remove route sources if they exist
      ['route-line-source', 'route-stops-source'].forEach(sourceId => {
        if (mapInstance.getSource(sourceId)) {
          mapInstance.removeSource(sourceId);
        }
      });
    };

    // Always clean up first
    cleanupRouteLayers();

    // If no route details, we're done
    if (!routeDetails) return;

    console.log('🗺️ Rendering route for train:', selectedTrain?.number, {
      geometryLength: routeDetails.geometry.length,
      stopsCount: routeDetails.stops.length,
      stopsWithCoordinates: routeDetails.stops.filter(s => s.coordinates).length,
      sampleStopCoordinates: routeDetails.stops.slice(0, 3).map(s => ({ 
        name: s.name, 
        coords: s.coordinates 
      }))
    });

    // Decode the polyline
    const decodedPath = decodePolyline(routeDetails.geometry);
    
    // Create GeoJSON for the route line
    const routeLineGeoJSON = {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: decodedPath
      },
      properties: {}
    };

    // Add route line source and layer
    mapInstance.addSource('route-line-source', {
      type: 'geojson',
      data: routeLineGeoJSON
    });

    mapInstance.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#2563eb', // Blue color
        'line-width': 3,
        'line-dasharray': [2, 1] // Dashed line
      }
    });

    // Create GeoJSON for stops
    const currentTime = new Date();
    const stopFeatures = routeDetails.stops
      .filter(stop => {
        // Only include stops that have GPS coordinates
        return stop.coordinates && stop.coordinates.latitude && stop.coordinates.longitude;
      })
      .map((stop, originalIndex) => {
        // Find the original index of this stop in the full stops array
        const fullStopIndex = routeDetails.stops.findIndex(s => s.id === stop.id || s.name === stop.name);
        const isNextStop = !stop.isPassed && 
          (fullStopIndex === 0 || routeDetails.stops[fullStopIndex - 1]?.isPassed);
        
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            // Use actual GPS coordinates from EMMA API
            coordinates: [stop.coordinates!.longitude, stop.coordinates!.latitude]
          },
          properties: {
            name: stop.name,
            isPassed: stop.isPassed,
            isNextStop,
            eta: stop.scheduledArrival ? formatTime(stop.scheduledArrival) : '',
            delay: stop.arrivalDelay,
            platform: stop.platform || '',
            stopId: stop.id || ''
          }
        };
      });

    const stopsGeoJSON = {
      type: 'FeatureCollection' as const,
      features: stopFeatures
    };

    // Add stops source
    mapInstance.addSource('route-stops-source', {
      type: 'geojson',
      data: stopsGeoJSON
    });

    // Layer for passed stops (gray, smaller)
    mapInstance.addLayer({
      id: 'route-stops-passed',
      type: 'circle',
      source: 'route-stops-source',
      filter: ['==', ['get', 'isPassed'], true],
      paint: {
        'circle-radius': 4,
        'circle-color': '#9ca3af', // Gray
        'circle-opacity': 0.6,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#6b7280'
      }
    });

    // Layer for upcoming stops (blue, larger)
    mapInstance.addLayer({
      id: 'route-stops-upcoming',
      type: 'circle',
      source: 'route-stops-source',
      filter: ['all', 
        ['==', ['get', 'isPassed'], false],
        ['==', ['get', 'isNextStop'], false]
      ],
      paint: {
        'circle-radius': 6,
        'circle-color': '#2563eb', // Blue
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    // Layer for next stop (pulsing animation)
    mapInstance.addLayer({
      id: 'route-stops-next',
      type: 'circle',
      source: 'route-stops-source',
      filter: ['==', ['get', 'isNextStop'], true],
      paint: {
        'circle-radius': 8,
        'circle-color': '#2563eb', // Blue
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.8
      }
    });

    // Enhanced ETA Label System - Progressive UX Approach
    
    // 1. Background pills for ETA labels (high contrast foundation)
    mapInstance.addLayer({
      id: 'route-stop-label-backgrounds',
      type: 'circle',
      source: 'route-stops-source',
      filter: ['all',
        ['==', ['get', 'isPassed'], false],
        ['!=', ['get', 'eta'], ''] // Only show if we have ETA data
      ],
      layout: {},
      paint: {
        // Adaptive sizing based on zoom level for better visibility
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          8, 14,  // At zoom 8: 14px radius
          12, 18, // At zoom 12: 18px radius  
          16, 22  // At zoom 16: 22px radius
        ],
        // High-contrast background with status color coding
        'circle-color': ['case',
          ['>', ['get', 'delay'], 0], '#dc2626', // Strong red for delayed
          '#059669' // Strong green for on-time
        ],
        'circle-opacity': 0.95,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 1
      }
    });

    // 2. Primary ETA text (large, high contrast)
    mapInstance.addLayer({
      id: 'route-stop-labels-primary',
      type: 'symbol',
      source: 'route-stops-source',
      filter: ['all',
        ['==', ['get', 'isPassed'], false],
        ['!=', ['get', 'eta'], '']
      ],
      layout: {
        'text-field': ['get', 'eta'],
        // Zoom-adaptive text sizing for optimal readability
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          8, 11,  // At zoom 8: 11px
          12, 14, // At zoom 12: 14px  
          16, 16  // At zoom 16: 16px
        ],
        'text-offset': [0, 0], // Centered on the background pill
        'text-anchor': 'center',
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], // Bold font for visibility
        'text-allow-overlap': false, // Smart collision detection
        'text-ignore-placement': false
      },
      paint: {
        'text-color': '#ffffff', // Always white for maximum contrast
        'text-opacity': 1
      }
    });

    // 3. Station name labels for context (shown at higher zoom levels)
    mapInstance.addLayer({
      id: 'route-stop-names',
      type: 'symbol',
      source: 'route-stops-source',
      filter: ['all',
        ['==', ['get', 'isPassed'], false],
        ['!=', ['get', 'eta'], '']
      ],
      minzoom: 11, // Only show station names when zoomed in enough
      layout: {
        'text-field': ['get', 'name'],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          11, 10, // At zoom 11: 10px
          16, 12  // At zoom 16: 12px
        ],
        'text-offset': [0, 2.5], // Position below the ETA
        'text-anchor': 'top',
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
        'text-max-width': 8, // Wrap long station names
        'text-allow-overlap': false
      },
      paint: {
        'text-color': '#374151', // Dark gray
        'text-halo-color': '#ffffff',
        'text-halo-width': 3,
        'text-halo-blur': 1
      }
    });

    // 4. Delay indicator badges for delayed trains (additional progressive enhancement)
    mapInstance.addLayer({
      id: 'route-stop-delay-indicators',
      type: 'symbol',
      source: 'route-stops-source',
      filter: ['all',
        ['==', ['get', 'isPassed'], false],
        ['>', ['get', 'delay'], 0] // Only for delayed stops
      ],
      layout: {
        'text-field': [
          'concat', 
          '+', 
          ['to-string', ['get', 'delay']], 
          ' min'
        ],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          8, 8,   // At zoom 8: 8px
          12, 10, // At zoom 12: 10px  
          16, 11  // At zoom 16: 11px
        ],
        'text-offset': [0, -2.2], // Position above the ETA
        'text-anchor': 'bottom',
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold']
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#dc2626',
        'text-halo-width': 3
      }
    });

    // Interactive enhancements for progressive UX
    
    // Event handler functions (defined outside for proper cleanup)
    const handleMouseEnter = () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    };
    
    const handleMouseLeave = () => {
      mapInstance.getCanvas().style.cursor = '';
    };

    // Enhanced click handler for stop details
    const handleStopClick = (e: any) => {
      if (e.features && e.features[0]) {
        const feature = e.features[0];
        const stopName = feature.properties?.name;
        const eta = feature.properties?.eta;
        const delay = feature.properties?.delay || 0;
        const platform = feature.properties?.platform;
        
        // Create rich popup content
        const popupContent = `
          <div style="padding: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #1f2937;">${stopName}</h3>
            <div style="font-size: 13px; color: #4b5563;">
              <div style="margin-bottom: 4px;">
                <strong>Érkezés:</strong> <span style="color: ${delay > 0 ? '#dc2626' : '#059669'};">${eta}</span>
              </div>
              ${delay > 0 ? `<div style="margin-bottom: 4px; color: #dc2626;"><strong>Késés:</strong> +${delay} perc</div>` : ''}
              ${platform ? `<div style="color: #6b7280;"><strong>Vágány:</strong> ${platform}</div>` : ''}
            </div>
          </div>
        `;
        
        new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: [0, -10]
        })
        .setLngLat(e.lngLat)
        .setHTML(popupContent)
        .addTo(mapInstance);
      }
    };
    
    // Add event listeners to interactive elements
    ['route-stop-label-backgrounds', 'route-stop-labels-primary'].forEach(layerId => {
      mapInstance.on('mouseenter', layerId, handleMouseEnter);
      mapInstance.on('mouseleave', layerId, handleMouseLeave);
      mapInstance.on('click', layerId, handleStopClick);
    });

    // Fit bounds to show the entire route with improved padding
    if (decodedPath.length > 0) {
      const bounds = decodedPath.reduce((bounds, coord) => {
        return bounds.extend(coord as [number, number]);
      }, new mapboxgl.LngLatBounds(decodedPath[0] as [number, number], decodedPath[0] as [number, number]));

      // Smart padding based on screen size
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const padding = isMobile 
        ? { top: 80, bottom: 100, left: 20, right: 20 } // More space for mobile UI
        : { top: 60, bottom: 60, left: 60, right: 350 }; // Account for desktop sidebar

      mapInstance.fitBounds(bounds, {
        padding,
        duration: 1500,
        maxZoom: 14 // Prevent over-zooming on short routes
      });
    }

    // Cleanup function with event listener removal
    return () => {
      // Remove event listeners before cleaning up layers
      ['route-stop-label-backgrounds', 'route-stop-labels-primary'].forEach(layerId => {
        if (mapInstance.getLayer(layerId)) {
          mapInstance.off('mouseenter', layerId, handleMouseEnter);
          mapInstance.off('mouseleave', layerId, handleMouseLeave);
          mapInstance.off('click', layerId, handleStopClick);
        }
      });
      
      cleanupRouteLayers();
    };
  }, [routeDetails, mapReady, selectedTrain]);

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
      <TrainInfoModal 
        train={selectedTrain} 
        onClose={() => setSelectedTrain(null)} 
      />


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