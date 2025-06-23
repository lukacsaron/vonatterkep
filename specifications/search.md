
## Specification: Train Search & Station Timetables

### 1. Vision & Guiding Principles

Our goal is to evolve VonatterKep from a real-time map into a comprehensive railway information hub. These new features will empower users to not only see where trains *are*, but to find the trains they *need* and understand station activity at a glance.

**Guiding Principles:**

*   **Clarity over Clutter:** Present complex timetable data in a simple, intuitive, and mobile-first interface.
*   **Performance is a Feature:** Searches and timetable loads must be near-instantaneous. We will leverage smart caching and efficient data fetching.
*   **Deep Integration:** The new pages must feel seamlessly connected to the existing map. Finding a train in a list should easily link to its live position on the map.
*   **Pragmatism over Perfection:** We will build upon the existing MÁV API integrations, acknowledging their capabilities and limitations, and architect for future enhancements.

### 2. User Stories

**Train Search:**

*   **As a daily commuter,** I want to quickly search for my train by its number (e.g., "S60", "406") to see its full schedule and live delay information.
*   **As a traveler planning a trip,** I want to find all trains running between two cities (e.g., Budapest and Debrecen) on a specific day to understand my options.
*   **As a curious user,** I want to see a list of all currently active long-distance trains (e.g., all InterCity trains) to get an overview of the network.

**Station Timetables:**

*   **As a passenger at a station,** I want to see a live departure board for my current location, including platform numbers, destinations, and real-time delays, so I know which train to board.
*   **As someone waiting to pick someone up,** I want to view the arrivals board for a station to see when their train is scheduled to arrive and if it's running late.
*   **As a planner,** I want to check the departure/arrival schedule for any station for a future date and time to plan my connections.

### 3. Feature & UI/UX Breakdown

#### 3.1. Page: Train Search (`/trains`)

This page will be the central point for finding specific train services.

**UI Layout:**

1.  **Header:** The standard `Navbar` component.
2.  **Search & Filter Bar:**
    *   A large, prominent search input field with a placeholder like "Search train number, name, or route (e.g., S60, Szeged, Budapest-Nyugati)...".
    *   Two `StationSearch` components for "From" and "To" stations.
    *   A "Search" button.
3.  **Results Area:**
    *   **Initial State:** Could display a curated list, like "Featured InterCity Routes" or "Major Suburban Lines".
    *   **Loading State:** A skeleton loader that mimics the result item's layout.
    *   **Empty State:** "No trains found. Try a different search."
    *   **Results List:** A vertically scrolling list of `TrainSearchResultItem` components.

**Components:**

*   **`TrainSearch.tsx` (New Page Component):** Manages state for search inputs and orchestrates data fetching using a new hook.
*   **`StationSearch.tsx` (Existing):** Reused for "From" and "To" inputs.
*   **`TrainSearchResultItem.tsx` (New):** A card-like component displaying a single search result.
    *   **Content:** Train number and name (e.g., "IC 560 LATORCA"), train type badge, origin and destination stations with departure/arrival times, duration, and a live delay indicator if the train is currently active.
    *   **Action:** Clicking the item will navigate to a new dynamic route `/trains/[gtfsId]` showing the `TrainInfoCard` in a dedicated, full-page view.

#### 3.2. Page: Station Timetables (`/departures`)

This page provides a classic station board experience. Let's rename the route to `/stations/[stationId]` to be more RESTful, but keep the Navbar link as "Departures" for user familiarity.

**UI Layout:**

1.  **Header:** The standard `Navbar`.
2.  **Station Selector & Controls:**
    *   A `StationSearch` component, pre-filled with the station from the URL, but allowing the user to easily search for another.
    *   A `Tabs` component with two tabs: "Departures" and "Arrivals".
    *   A `DatePicker` and `TimePicker` to select the date and time for the timetable.
3.  **Timetable List:**
    *   A responsive table or a list of `TimetableRow` components.
    *   **Table Headers:** Time, Destination/Origin, Train #, Platform, Delay/Status.
    *   The list will auto-refresh to show the latest delay and platform information.

**Components:**

*   **`StationTimetablePage.tsx` (New Page Component):** Manages the selected station, date, and tab state. Fetches data using the existing `useDepartures` hook (which we will enhance).
*   **`StationSearch.tsx` (Existing):** Reused for station selection.
*   **`TimetableRow.tsx` (New):** Displays a single departure or arrival.
    *   **Content:** Scheduled time, destination/origin, train number, platform (if available), and a prominent `DelayIndicator`. The scheduled time should be crossed out if there's a delay, with the new estimated time shown.
    *   **Action:** Clicking a row will open the `TrainInfoCard` in a modal or navigate to the train's detail page (`/trains/[gtfsId]`).

### 4. Technical Specification

#### 4.1. New API Endpoints

We need to create two new API endpoints and enhance the backend logic.

**1. Train Search API**

*   **Endpoint:** `GET /api/trains/search`
*   **Purpose:** To find train services based on various criteria. This is NOT for live positions but for route/schedule discovery.
*   **Query Parameters:**
    *   `q` (string, optional): A general search query for train number or name.
    *   `fromStationId` (string, optional): UIC Code of the origin station.
    *   `toStationId` (string, optional): UIC Code of the destination station.
    *   `date` (string, optional, format `YYYY-MM-DD`): The date to search for. Defaults to today.
*   **Response Body:** `TrainSearchResult[]` (see Data Models below).
*   **Backend Logic:**
    1.  This is the most challenging part as MÁV doesn't provide a simple "search all trains" API. We must compose this functionality.
    2.  **If `q` is provided:** Attempt to fetch details for that train directly using a modified `mavApi.getTrainDetails` if it's a known `gtfsId` or by parsing the number.
    3.  **If `fromStationId` is provided:** Use `mavApi.getDepartures(fromStationId)`. This will return all trains departing from that station.
    4.  **If `toStationId` is also provided:** After getting departures from `fromStationId`, filter the results to only include trains whose destination matches or whose route includes `toStationId`. The second part requires fetching `getTrainDetails` for each departure, which can be slow.
    5.  **Caching:** Results for a given `fromStationId` and `date` should be cached for at least 5-10 minutes to reduce load on the MÁV API. A `[stationId]-[date]` key in an in-memory cache or Redis would be effective.

**2. Station Timetable API**

*   **Endpoint:** `GET /api/stations/[stationId]/timetable`
*   **Purpose:** To get a list of arrivals or departures for a specific station.
*   **Query Parameters:**
    *   `type` (enum `departures` | `arrivals`, required): Specifies whether to fetch departures or arrivals.
    *   `date` (string, optional, format `YYYY-MM-DDTHH:mm:ssZ`): ISO 8601 string for the query time. Defaults to now.
*   **Response Body:** `Departure[]` (using the existing, well-defined type).
*   **Backend Logic:**
    1.  This route will be a thin wrapper around the existing `mavApi.getDepartures(stationId, date)`.
    2.  The MÁV Mobile API's `GetAllomasInfo` provides both `Indulasok` (Departures) and `Erkezesek` (Arrivals). The backend logic will select the appropriate array based on the `type` parameter.
    3.  The response data should be transformed using the existing `transformMavDeparture` function.

#### 4.2. Data Models (in `src/types/index.ts`)

We need a new type for the train search results.

```typescript
// src/types/index.ts

// ... existing types

export interface TrainSearchResult {
  gtfsId: string;
  trainNumber: string;
  trainName?: string; // e.g., "TÓPART"
  trainType: TrainType;
  origin: {
    name: string;
    time: Date;
  };
  destination: {
    name: string;
    time: Date;
  };
  durationMinutes: number;
  liveDelayMinutes?: number; // Optional: only if train is active
  isActive: boolean; // Is the train currently running and trackable?
}

// Enhance Departure to be more flexible for Arrivals
export interface Departure {
  train: Train;
  time: Date; // Generic time, can be arrival or departure
  platform?: string;
  // For Departures, this is the destination. For Arrivals, this is the origin.
  remoteStation: Station; 
  delay: number;
  status: DepartureStatus;
}
```

#### 4.3. Frontend Architecture

*   **Data Fetching:**
    *   `useTrainSearch(params)`: A new hook in `src/lib/hooks/useTrains.ts` that uses `useQuery` to call `/api/trains/search`. The query key will be `['trains', 'search', params]`.
    *   `useDepartures` & `useArrivals`: The existing `useDepartures` hook can be adapted. We can create a more generic `useTimetable(stationId, type, date)` hook that calls the new `/api/stations/[stationId]/timetable` endpoint. It should have `refetchInterval` set to ~30 seconds to provide live updates.
*   **State Management (Zustand):**
    *   No new stores are immediately necessary. The state for search inputs and timetable controls can be managed locally within the page components using `useState` or `useReducer`, as it's not shared globally.
*   **Routing:**
    *   Create new folders in `src/app`: `trains/page.tsx`, `trains/[gtfsId]/page.tsx`, and `stations/[stationId]/page.tsx`.

### 5. Implementation Plan & Milestones

1.  **Milestone 1: Backend Foundation**
    *   [ ] Implement the `GET /api/stations/[stationId]/timetable` API route.
    *   [ ] Implement the `GET /api/trains/search` API route with caching.
    *   [ ] Add/refine `mav.ts` to support fetching arrivals and handling search logic.
    *   [ ] Write unit/integration tests for the new endpoints.

2.  **Milestone 2: Station Timetable UI**
    *   [ ] Create the `/stations/[stationId]/page.tsx` layout.
    *   [ ] Develop the `TimetableRow` component.
    *   [ ] Implement the `useTimetable` hook and integrate it into the page.
    *   [ ] Ensure the page is responsive and updates in real-time.

3.  **Milestone 3: Train Search UI**
    *   [ ] Create the `/trains/page.tsx` layout.
    *   [ ] Develop the `TrainSearchResultItem` component.
    *   [ ] Implement the `useTrainSearch` hook.
    *   [ ] Integrate search inputs and results display.
    *   [ ] Create the `/trains/[gtfsId]` detail page to display the `TrainInfoCard`.

4.  **Milestone 4: Polish & Integration**
    *   [ ] Ensure seamless navigation between the map, search, and timetable pages.
    *   [ ] Add comprehensive loading and error states to all new UIs.
    *   [ ] Conduct end-to-end testing of the entire user flow.
    *   [ ] Code review and documentation update.

### 6. Future Considerations & Scalability

*   **Journey Planner:** The `fromStationId` and `toStationId` search is a stepping stone to a full journey planner. A future version could integrate transfer calculations.
*   **Database Cache:** For the train search functionality, which can be API-intensive, a persistent cache (like Redis) or even a pre-populated PostgreSQL database with all train routes (updated daily) would significantly improve performance and reliability over an in-memory cache.
*   **WebSockets for Live Timetables:** Instead of polling every 30 seconds, a WebSocket connection could push updates to the client for the viewed station board, reducing unnecessary network traffic.
*   **User Favorites:** The `useUserStore` already has a concept of favorites. We should add "star" icons to trains and stations, allowing users to save them for quick access.