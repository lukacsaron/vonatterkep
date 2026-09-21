'use client';

import { useEffect, useRef, useState, useMemo, memo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore, useLocationStore } from '@/lib/store';
import { useTrains, useTrainRoute } from '@/lib/hooks/useTrains';
import { TrainInfoModal } from '../Train/TrainInfoModal';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { DelayLegend } from '../UI/DelayLegend';
import { LocationButton } from '../UI/LocationButton';
import { Train, Coordinates } from '@/types';
import { getDelayCategory, getDelayColor, decodePolyline, formatTime } from '@/lib/utils';
import { decodeRoutePolyline, resolveRouteDirection, snapToRoute } from '@/lib/geo/snapToRoute';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const INITIAL_CENTER: [number, number] = [19.0408, 47.4979]; // Budapest [lng, lat]
const INITIAL_ZOOM = 7;

// OpenRailwayMap's tile usage policy asks for exactly this attribution.
const OPENRAILWAYMAP_ATTRIBUTION =
  'Data <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>, ' +
  'Style: <a href="https://creativecommons.org/licenses/by-sa/2.0/" target="_blank" rel="noopener">CC-BY-SA 2.0</a> ' +
  '<a href="https://www.openrailwaymap.org/" target="_blank" rel="noopener">OpenRailwayMap</a> and OpenStreetMap';

// Delay is otherwise shown by marker colour only, which red-green colour-blind
// visitors cannot tell apart. From this zoom, trains at least 5 minutes late (the
// first non-green category) also get a "+N" minute label.
const DELAY_LABEL_MIN_DELAY = 5;
const DELAY_LABEL_MIN_ZOOM = 8;

const TRAIN_LAYER_IDS = ['trains', 'train-arrows', 'train-delay-labels'] as const;

interface TrainMapProps {
  accessToken: string;
}

function TrainMapComponent({ accessToken }: TrainMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [showRailwayOverlay, setShowRailwayOverlay] = useState(true);
  
  // Individual selectors: subscribing to the whole store re-rendered the map on
  // every setBounds() call, i.e. after every pan and zoom.
  const selectedTrain = useMapStore(state => state.selectedTrain);
  const focusedTrain = useMapStore(state => state.focusedTrain);
  const setSelectedTrain = useMapStore(state => state.setSelectedTrain);
  const setFocusedTrain = useMapStore(state => state.setFocusedTrain);
  const setBounds = useMapStore(state => state.setBounds);
  const { data: trains, isLoading, isFetching, error, refetch } = useTrains();
  // Hook for fetching train route details
  const { data: routeDetails } = useTrainRoute(selectedTrain?.gtfsId || null);
  
  // Location store hooks
  const userLocation = useLocationStore(state => state.userLocation);
  const isCentered = useLocationStore(state => state.isCentered);
  const setIsCentered = useLocationStore(state => state.setIsCentered);
  const [isInitialLocationSet, setIsInitialLocationSet] = useState(false);

  // The map's click handlers are registered once; they read the current trains
  // through this ref instead of the array captured when the layers were created.
  const trainsRef = useRef<Train[] | undefined>(trains);
  useEffect(() => {
    trainsRef.current = trains;
  }, [trains]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Tile failures after the first load (an OpenRailwayMap tile timing out, a
    // 5xx) are transient and leave the rest of the map working, so only errors
    // before the map has loaded replace it with the error view.
    let hasLoaded = false;
    let boundsTimeout: ReturnType<typeof setTimeout> | undefined;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        accessToken,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        // Explicitly set coordinate system - Mapbox uses Web Mercator internally
        projection: { name: 'mercator' },
        // No performance telemetry beacons to events.mapbox.com (the billing
        // map-load event is unaffected).
        performanceMetricsCollection: false,
        // Do not re-download tiles that expire while the page stays open: the
        // base map and the railway overlay do not change during a session, and
        // OpenRailwayMap asks heavy users to keep their request volume down.
        refreshExpiredTiles: false,
      });

      map.current.on('load', () => {
        hasLoaded = true;

        // Add OpenRailwayMap overlay for railway tracks
        map.current!.addSource('railway-tiles', {
          type: 'raster',
          tiles: [
            'https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          // The tile server has nothing above z19 (404s); overzoom z19 instead.
          maxzoom: 19,
          attribution: OPENRAILWAYMAP_ATTRIBUTION
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
        console.error('Map error:', e.error ?? e);
        const isTileError = 'tile' in e || 'sourceId' in e;
        if (!hasLoaded && !isTileError) {
          setMapError('Nem sikerült betölteni a térképet');
        }
      });

      // Use a debounced bounds update to prevent excessive re-renders
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

            // Validate bounds are reasonable (roughly around Hungary/Europe)
            if (newBounds.north >= 40 && newBounds.north <= 55 && 
                newBounds.south >= 40 && newBounds.south <= 55 &&
                newBounds.south < newBounds.north &&
                newBounds.east >= 10 && newBounds.east <= 30 &&
                newBounds.west >= 10 && newBounds.west <= 30 &&
                newBounds.west < newBounds.east) {
              setBounds(newBounds);
            } else {
              // Auto-correct map to Hungary if bounds go crazy
              map.current?.easeTo({
                center: INITIAL_CENTER,
                zoom: INITIAL_ZOOM,
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
      clearTimeout(boundsTimeout);
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once

  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Snap-to-track, for the selected train only ---------------------------
  //
  // Raw MAV GPS sits beside the rails rather than on them. We project it onto the
  // trip's route polyline, which the detail view has already fetched and cached.
  // Deliberately limited to the one selected train: every other train would mean
  // one upstream geometry request each, ~330 per refresh cycle, which is exactly
  // the traffic pattern that got this server IP-blocked by MAV before. Nothing
  // here issues a request of its own.
  const selectedTrainId = selectedTrain?.id ?? null;

  const selectedRoutePath = useMemo(
    () => decodeRoutePolyline(routeDetails?.geometry),
    [routeDetails?.geometry]
  );

  // MAV hands back *line* geometry, which is not guaranteed to run in the train's
  // direction of travel, so heading alone cannot tell two anti-parallel legs apart.
  // The trip's stops, in schedule order, settle it when they carry coordinates.
  const selectedRouteDirection = useMemo(
    () => resolveRouteDirection(selectedRoutePath, (routeDetails?.stops ?? []).map(stop => stop.coordinates)),
    [selectedRoutePath, routeDetails?.stops]
  );

  // Memoize expensive GeoJSON features creation
  const geoJsonFeatures = useMemo(() => {
    if (!trains) return [];
    
    return trains
      .filter((train): train is Train & { position: Coordinates } => {
        // A train without a GPS fix is simply not drawn - it is never placed at 0,0.
        if (!train.position) return false;
        const coords = [train.position.longitude, train.position.latitude];
        // Validate coordinates are reasonable for Hungary
        return !(Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90 ||
                coords[1] < 45.5 || coords[1] > 48.7 ||
                coords[0] < 16.0 || coords[0] > 23.0);
      })
      .map(train => {
        // Stable delay calculation to prevent flickering
        const stableDelay = Math.round(train.delay);

        // Only the selected train is snapped, and only when the projection lands
        // within the module's distance ceiling. Everything else keeps raw GPS.
        let coordinates: [number, number] = [train.position.longitude, train.position.latitude];
        if (selectedTrainId && train.id === selectedTrainId && selectedRoutePath.length > 1) {
          const snap = snapToRoute(train.position, selectedRoutePath, {
            heading: train.heading,
            routeDirection: selectedRouteDirection,
          });
          if (snap.snapped) {
            coordinates = snap.position;
          }
        }

        // Only what the layers and the click handler read goes to the map's
        // worker; the colour is a pure function of the rounded delay.
        return {
          type: 'Feature' as const,
          properties: {
            id: train.id,
            delay: stableDelay,
            color: getDelayColor(getDelayCategory(stableDelay)),
            heading: train.heading || 0
          },
          geometry: {
            type: 'Point' as const,
            coordinates
          }
        };
      });
  }, [trains, selectedTrainId, selectedRoutePath, selectedRouteDirection]);

  // Update train positions using GeoJSON layer instead of individual markers
  useEffect(() => {
    if (!map.current || !geoJsonFeatures.length || !mapReady) return;

    // Debounce rapid updates during zoom/pan operations
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(() => {
    const geojson = {
      type: 'FeatureCollection' as const,
      features: geoJsonFeatures
    };

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

      // Colour-independent delay cue: "+N" (minutes) beside every train that is
      // at least DELAY_LABEL_MIN_DELAY late. Same GeoJSON source, no DOM markers.
      // Labels take the first free spot around the marker and are dropped where
      // they would collide, larger delays first, so dense areas stay readable.
      map.current.addLayer({
        id: 'train-delay-labels',
        type: 'symbol',
        source: 'trains',
        minzoom: DELAY_LABEL_MIN_ZOOM,
        filter: ['>=', ['get', 'delay'], DELAY_LABEL_MIN_DELAY],
        layout: {
          'text-field': ['concat', '+', ['to-string', ['get', 'delay']]],
          // Already loaded by the streets-v12 place labels: no extra glyph request.
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], DELAY_LABEL_MIN_ZOOM, 11, 12, 13],
          'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
          'text-radial-offset': 1.1,
          'text-justify': 'auto',
          'text-padding': 1,
          'symbol-sort-key': ['-', ['get', 'delay']]
        },
        paint: {
          'text-color': '#111827',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5
        }
      });

      // Add pointer cursor on hover
      const mapInstance = map.current;
      const showPointer = () => { mapInstance.getCanvas().style.cursor = 'pointer'; };
      const hidePointer = () => { mapInstance.getCanvas().style.cursor = ''; };

      const handleTrainClick = (e: mapboxgl.MapLayerMouseEvent) => {
        const trainId = e.features?.[0]?.properties?.id;
        const train = trainsRef.current?.find(t => t.id === trainId);
        if (train) {
          setSelectedTrain(train);
        }
      };

      for (const layerId of TRAIN_LAYER_IDS) {
        mapInstance.on('mouseenter', layerId, showPointer);
        mapInstance.on('mouseleave', layerId, hidePointer);
        mapInstance.on('click', layerId, handleTrainClick);
      }
    }

    }, 100); // 100ms debounce to prevent rapid updates during zoom

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [geoJsonFeatures, setSelectedTrain, mapReady]);

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

    // Route layers go under the trains. If the train layers are not there yet (the
    // route came from cache on a fresh mount), add them on top for now - the
    // train layers are added later and so still end up above. A missing beforeId
    // would otherwise fail the addLayer call and fire a map error.
    const beforeTrains = mapInstance.getLayer('train-arrows') ? 'train-arrows' : undefined;

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
    }, beforeTrains); // Insert before train layers to ensure trains appear on top

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
    }, beforeTrains);

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
    }, beforeTrains);

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
    }, beforeTrains);

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
    // Route is now displayed without adjusting map bounds
    // This keeps the map focused on the train position rather than zooming out to show the entire route

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
  }, [routeDetails, mapReady]);

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

    // A train without a GPS fix cannot be focused.
    if (!focusedTrain.position) return;

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

      {/* UI controls */}
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

          {/* Manual refresh */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 rounded-lg shadow-md hover:bg-gray-50 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
            title="Vonatadatok frissítése"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'motion-safe:animate-spin')} />
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
      
      {/* Only on the very first load, not on background refreshes */}
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

// Memoized: its only prop is the build-time token, so parent re-renders skip it.
export const TrainMap = memo(TrainMapComponent);