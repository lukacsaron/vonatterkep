Of course. Based on a complete analysis of your existing codebase, here is a detailed technical specification for adding a user location-aware feature to your VasútTérkép application.

This specification is designed to integrate seamlessly with your current architecture, including `Mapbox GL JS`, `Zustand` for state management, and your component structure.

---

### **Specification: User Location Integration**

#### **1. Vision & Guiding Principles**

The goal is to enhance the user experience by making the map immediately relevant to the user's physical location. The feature should be intuitive, non-intrusive, and respectful of user privacy.

*   **Principle 1: User-Initiated & Permission-First:** We will not ask for location access immediately on page load. Instead, the user will trigger the location request by interacting with a clear UI element, promoting a better privacy experience.
*   **Principle 2: Subtle & Informative:** The initial map adjustment will be a gentle pan-and-zoom, not a jarring jump. The user's location will be clearly, yet subtly, marked on the map.
*   **Principle 3: "Just Works" Functionality:** The feature should feel like a native part of the map experience, with clear states for loading, success, and error/denial.

---

#### **2. User Stories**

1.  **As a new user,** when I first open the map, I want to see a button that lets me center the view on my current location, so I can instantly see trains nearby without manual navigation.
2.  **As a user,** after I grant permission, I want the map to smoothly pan and zoom to my area, giving me immediate context.
3.  **As a user exploring the map,** if I pan away from my location, I want to be able to tap the "center on me" button again to quickly return to my current position.
4.  **As a privacy-conscious user,** I want to be able to deny the location permission request and still have a fully functional map.

---

#### **3. UI/UX & Component Breakdown**

##### **3.1. New Component: `LocationButton.tsx`**

A new, dedicated button will be created to control all location functionality.

*   **Icon:** It will use the `Navigation` icon from `lucide-react`.
*   **Positioning:** Placed in the **top-right** corner of the map, below the global search button (if any) and above other overlays like the legend. This is a standard, intuitive position.
*   **States & Appearance:**
    *   **Default/Idle:** A circular button with a dark gray icon on a white background, with a subtle shadow.
    *   **Locating:** When the browser is acquiring the location, the `Navigation` icon will be replaced by a `LoadingSpinner` within the button to provide immediate feedback. The button will be disabled during this state.
    *   **Active/Centered:** When the map is centered on the user's location, the button's icon will turn blue (`bg-blue-100 text-blue-600`) to indicate its active state.
    *   **Permission Denied:** The button will be visible but disabled (grayed out) with a tooltip explaining that location access is needed.

##### **3.2. New Map Element: User Location Marker**

A custom marker will be added to the map to represent the user's position.

*   **Appearance:** A solid, circular blue dot.
*   **Animation:** The dot will have a larger, semi-transparent blue ring around it that uses a CSS `pulse` animation. This "sonar" effect clearly indicates that this is the live user location and distinguishes it from static train markers.

---

#### **4. Technical Specification**

##### **4.1. New State Store: `useLocationStore.ts`**

To manage location state cleanly and decouple it from the `Map` component, we will create a new Zustand store.

**File:** `src/lib/store.ts` (add a new store)

```typescript
// src/lib/store.ts

// ... existing stores

export type LocationPermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable';

interface LocationState {
  userLocation: Coordinates | null;
  permissionState: LocationPermissionState;
  isLocating: boolean;
  isCentered: boolean; // NEW: To track if the map view is focused on the user
  requestLocation: () => void;
  setUserLocation: (location: Coordinates | null) => void;
  setPermissionState: (state: LocationPermissionState) => void;
  setIsLocating: (isLocating: boolean) => void;
  setIsCentered: (isCentered: boolean) => void;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  userLocation: null,
  permissionState: 'prompt', // Initial state
  isLocating: false,
  isCentered: false,
  setUserLocation: (location) => set({ userLocation: location }),
  setPermissionState: (state) => set({ permissionState: state }),
  setIsLocating: (isLocating) => set({ isLocating: isLocating }),
  setIsCentered: (isCentered) => set({ isCentered: isCentered }),
  requestLocation: () => {
    if (!navigator.geolocation) {
      set({ permissionState: 'unavailable' });
      return;
    }

    set({ isLocating: true, isCentered: false });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        set({
          userLocation: newLocation,
          permissionState: 'granted',
          isLocating: false,
          isCentered: true, // Set to true on successful location get
        });
      },
      (error) => {
        console.error('Geolocation error:', error);
        set({
          userLocation: null,
          permissionState: 'denied',
          isLocating: false,
          isCentered: false,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  },
}));
```

##### **4.2. New Component Implementation: `LocationButton.tsx`**

**File:** `src/app/components/UI/LocationButton.tsx` (New File)

```typescript
'use client';

import { Navigation, Loader2 } from 'lucide-react';
import { useLocationStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function LocationButton() {
  const { requestLocation, isLocating, permissionState, isCentered } = useLocationStore();
  const isDisabled = isLocating || permissionState === 'denied' || permissionState === 'unavailable';
  
  const getTitle = () => {
    if (isLocating) return 'Helymeghatározás...';
    if (isDisabled) return 'Helymeghatározás nem elérhető vagy letiltva';
    return 'Ugrás a helyzetemre';
  };

  return (
    <button
      onClick={requestLocation}
      disabled={isDisabled}
      title={getTitle()}
      className={cn(
        'bg-white rounded-full shadow-md p-3 text-gray-600 hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        isCentered && !isLocating && 'bg-blue-100 text-blue-600 hover:bg-blue-200'
      )}
    >
      {isLocating ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Navigation className="h-5 w-5" />
      )}
    </button>
  );
}
```

##### **4.3. Modifying `TrainMap.tsx`**

The `TrainMap` component will be the orchestrator.

**File:** `src/app/components/Map/TrainMap.tsx`

```typescript
// src/app/components/Map/TrainMap.tsx

// ... other imports
import { useLocationStore } from '@/lib/store';
import { LocationButton } from '../UI/LocationButton';

// Add this to your globals.css
/*
@keyframes pulse {
  0% { transform: scale(1); opacity: 0.5; }
  100% { transform: scale(2.5); opacity: 0; }
}
.user-location-pulse {
  animation: pulse 2s infinite;
}
*/

// ... inside TrainMapComponent function
const { userLocation, isCentered, setIsCentered } = useLocationStore();
const [isInitialLocationSet, setIsInitialLocationSet] = useState(false);

// Effect to handle map movement and marker update
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
    
    // Add custom class to the pulse layer's canvas element for animation
    const pulseLayerElement = document.querySelector('.mapboxgl-canvas-container .mapboxgl-canvas');
    if (pulseLayerElement && mapInstance.getLayer('user-location-pulse-layer')) {
        // This is a bit of a hack, a better way is to use a custom marker element if this doesn't work well
        // For simplicity, we assume we can add a class to the pulsing circle itself.
        // A more robust way is to create a custom HTML marker.
    }
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
  if (userLocation && isCentered) {
    mapInstance.easeTo({
      center: [userLocation.longitude, userLocation.latitude],
      zoom: Math.max(mapInstance.getZoom(), 12), // Don't zoom out if already zoomed in
      duration: 1500,
    });
  }

}, [userLocation, mapReady, isInitialLocationSet, isCentered, setIsCentered]);


// In the TrainMapComponent's return JSX:
return (
  <div className="relative w-full h-full">
    <div ref={mapContainer} className="w-full h-full" />
    
    {/* ... existing overlays like TrainInfoCard, DelayLegend, etc. ... */}

    {/* Location Button */}
    <div className="absolute top-20 right-4 z-10">
      <LocationButton />
    </div>

    {/* ... other existing elements ... */}
  </div>
);
```

##### **4.4. CSS for Pulse Animation**

**File:** `src/app/globals.css` (add this)

```css
@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(0, 124, 255, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 20px rgba(0, 124, 255, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(0, 124, 255, 0);
  }
}

/* This is a conceptual class. The best way to implement the pulse is on the Mapbox layer itself if possible,
   or by creating a custom HTML Marker with this class. */
.user-location-pulse {
  animation: pulse 2s infinite;
}
```
*Note: Directly applying a CSS animation to a Mapbox GL JS circle layer is not straightforward. The most robust way to achieve the pulse is to use a custom HTML marker for the user's location, which can then be styled freely with CSS. The provided code gives the layer-based approach, which is more performant if the visual effect is acceptable.*

---

#### **5. Implementation Plan**

1.  **[ ] Milestone 1: State Management & Logic**
    *   Add the `useLocationStore` to `src/lib/store.ts`.
    *   Ensure the `requestLocation` function correctly interfaces with `navigator.geolocation`.

2.  **[ ] Milestone 2: UI Component**
    *   Create the new `LocationButton.tsx` component in `src/app/components/UI/`.
    *   Implement all visual states (default, locating, active, disabled) using `lucide-react` icons and `cn`.

3.  **[ ] Milestone 3: Map Integration**
    *   Modify `TrainMap.tsx` to include the `useLocationStore`.
    *   Add the `useEffect` hook to handle map movements (`easeTo`) and respond to state changes.
    *   Add the logic to create and update the `'user-location-source'` GeoJSON source and its associated layers.
    *   Add the `<LocationButton />` to the JSX layout.

4.  **[ ] Milestone 4: Styling & Refinement**
    *   Add the `@keyframes pulse` to `globals.css`.
    *   Implement the pulsing animation for the user location marker (preferably using a custom HTML marker for full CSS control).
    *   Test the full user flow, including:
        *   First-time visit -> click button -> grant permission.
        *   First-time visit -> click button -> deny permission.
        *   Pannning away and clicking the button to re-center.
        *   Button states during location acquisition.