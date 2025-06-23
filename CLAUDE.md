# VonatterKep Project Guide

## Project Overview
VonatterKep is a modern web application for real-time Hungarian railway (MÁV) tracking and journey planning. It provides live train positions, delay information, route planning, and station details.

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Maps**: Mapbox GL JS
- **State Management**: Zustand
- **Data Fetching**: TanStack Query
- **Real-time**: Socket.io
- **Backend**: Node.js, Express, GraphQL (Apollo Server)
- **Database**: PostgreSQL with PostGIS, Redis
- **Infrastructure**: Docker, Kubernetes

## Key Commands
```bash
# Development
npm run dev       # Start development server with Turbopack
npm run build     # Build for production
npm run start     # Start production server

# Code Quality
npm run lint      # Run ESLint
npm run typecheck # Run TypeScript type checking
npm run format    # Format code with Prettier

# Testing
npm run test      # Run unit tests
npm run test:e2e  # Run E2E tests
npm run test:ci   # Run all tests for CI

# Database
npm run db:migrate    # Run database migrations
npm run db:seed       # Seed development data
npm run db:reset      # Reset database
```

## Project Structure
```
src/
├── app/              # Next.js app directory
│   ├── api/          # API routes
│   ├── (routes)/     # Page routes
│   └── components/   # Shared components
├── lib/              # Utility functions
│   ├── api/          # API client functions
│   ├── hooks/        # Custom React hooks
│   └── utils/        # Helper functions
├── services/         # Backend services (if monorepo)
└── types/            # TypeScript type definitions
```

## API Endpoints
- GraphQL endpoint: `/api/graphql`
- REST fallback: `/api/v1/*`
- WebSocket: `ws://localhost:3000/socket.io`

## Environment Variables
```
# API Keys
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
MAV_API_KEY=your_mav_api_key

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/vonatterkep
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your_jwt_secret
```

## Key Features
1. Real-time train tracking on interactive map ✅
2. Global search with Cmd+K shortcut ✅
3. Station departure/arrival boards ✅
4. Journey planning with multiple routes
5. User accounts with favorites
6. Delay notifications
7. Offline support (PWA)

## Data Sources
- **MÁV EMMA GraphQL API**: Real-time train positions (primary)
- **MÁV MobileService REST API**: Stations and departures
- **Authentication**: 
  - EMMA API: User-Agent header (no API key needed)
  - MobileService API: Hardcoded UAID token (from reference)
- **Fallback**: Mock data if APIs fail

## MÁV API Integration
The app integrates with real MÁV APIs using patterns from reference implementations:

### Why No API Key is Needed:
1. **EMMA GraphQL API**: Public endpoint used by MÁV's website
2. **MobileService API**: Uses a static UAID token found in reference
3. **Rate Limiting**: APIs are public but may have usage limits
4. **CORS**: Server-side proxy prevents browser CORS issues

### API Endpoints Used:
- `POST /VIM/PR/150225/MobileService.svc/rest/GetAlapadatok` - Stations
- `POST /VIM/PR/150225/MobileService.svc/rest/GetAllomasInfo` - Departures  
- `POST /jegy.mav.hu/api/graphql` - Real-time train positions

### Data Flow:
1. Client requests `/api/trains`
2. Server calls MÁV EMMA API for real-time positions
3. Fallback to MobileService API if needed
4. Transform MÁV data format to app format
5. Return standardized train data to client

## Performance Requirements
- Page load: <2s on 3G
- API response: <200ms p95
- Support 100k+ concurrent users
- 99.9% uptime target

## Security Considerations
- Rate limiting on all API endpoints
- Input validation and sanitization
- JWT authentication for user endpoints
- HTTPS only with HSTS
- CSP headers for XSS protection

## Development Workflow
1. Create feature branch from `main`
2. Implement feature with tests
3. Run linting and type checking
4. Create PR with description
5. Deploy to staging after approval
6. Monitor metrics post-deployment

## Useful Resources
- MÁV API Docs: [reference implementations in references/ folder]
- Mapbox Docs: https://docs.mapbox.com
- Next.js Docs: https://nextjs.org/docs
- shadcn/ui: https://ui.shadcn.com

## Search Functionality

### Global Search (Cmd+K)
The app features a powerful global search accessible via:
- **Keyboard Shortcut**: `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
- **Navigation**: Click "Search" in the navbar
- **Direct URL**: `/search`

### Search Features
- **Fuzzy Matching**: Searches train numbers, names, and routes
- **Real-time Results**: Updates as you type with 150ms debounce
- **Keyboard Navigation**: Arrow keys, Enter to select, Escape to close
- **Smart Relevance**: Exact matches ranked higher than partial matches
- **Map Integration**: Selecting a train zooms the map and focuses on it

### Search Types
1. **Train Numbers**: "IC 560", "S80", "9001" - exact and partial matches
2. **Train Names**: "LATORCA", "TISZA" - special named trains
3. **Routes/Destinations**: "Budapest Szeged", "Veszprém" - by station names
4. **Mixed Search**: Automatically detects and ranks by relevance

### Implementation
- `useTrainSearch` hook: Fuzzy search with relevance scoring
- `SearchModal` component: Full keyboard navigation and UI
- `GlobalSearchProvider`: App-wide Cmd+K shortcut handling
- `zoomToTrain` store action: Map integration for search results

## Common Tasks

### Adding a New Page
1. Create route in `src/app/`
2. Add types in `src/types/`
3. Create API client in `src/lib/api/`
4. Add components in `src/app/components/`
5. Include `<Navbar />` for consistent navigation

### Adding API Endpoint
1. Create route in `src/app/api/`
2. Add validation with zod
3. Implement rate limiting
4. Add to GraphQL schema if applicable

### Deploying
1. Run tests: `npm run test:ci`
2. Build: `npm run build`
3. Deploy with Docker/Kubernetes
4. Monitor logs and metrics

## Notes
- Always check existing MÁV API responses before implementing
- Prioritize mobile experience (70%+ users)
- Keep real-time updates efficient to reduce server load
- Cache aggressively but invalidate smartly