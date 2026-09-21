# VasútTérkép — project guide

Live map of trains on the Hungarian rail network. Next.js 15 (App Router) plus a
background worker, both in one container, with Redis as the only datastore.

## Commands

```bash
npm run dev            # next dev on :3000
npm run dev:worker     # the background poller (tsx)
npm run build          # next build + tsc -p tsconfig.worker.json
npm start              # next start
npm run start:standalone  # exactly what production runs
npm run typecheck      # tsc --noEmit
npm run check:api      # pins API paths + NEXT_PUBLIC_API_URL handling
npm run lint
```

There is no test suite. `npm run check:api` and CI (typechecks + build + a guard
that no CSS file ends up in `rootMainFiles`) are what stand in for one.

## Where the data comes from

| Source | Used for | Notes |
|---|---|---|
| `vonatinfo.mav.hu/map.aspx/getData` | live positions and delays (`TRAINS`), a train's timetable, category and polyline (`TRAIN`), a station's board (`STATION`) | POST, gzipped, XML-converted-to-JSON so fields are `@`-prefixed. The station board is looked up by station NAME. |
| MÁV GTFS (`mavcsoport.hu/gtfs/gtfsMavMenetrend.zip`) | the station list with coordinates | HTTP Basic auth; the worker checks hourly with `If-Modified-Since` and downloads only on change |

Dead ends, do not reintroduce: `mavplusz.hu` (the OTP/EMMA backend) IP-blocks this
server with 403 "host limit achived"; `vim.mav-start.hu` (MobileService) is gone.

Identifiers are messy, deliberately handled in code:
- `Train.gtfsId` holds vonatinfo's **ElviraID**, not a GTFS id. The name is kept
  because the frontend and the typed API client depend on it.
- `Train.id` is the raw feed number (with the operator prefix) so old `?train=`
  links keep working; `Train.number` is the public number (`55142` → `142`).
- GTFS stop ids match neither vonatinfo nor the old ids, so stations are linked
  **by name** (names are unique in the feed). `src/lib/gtfs/legacyStationIds.ts`
  maps every station id the site ever served onto a name.

**Times are the sharpest edge here.** vonatinfo returns Budapest wall clock with
no timezone and the server runs UTC. Always build instants through
`src/lib/time/budapest.ts` / `wallClock.ts`; `new Date(y, m, d)` or `setHours()`
silently lands two hours out.

## Layout

```
src/app/api/*          REST layer the frontend talks to
src/lib/api/mav.ts     vonatinfo client + parsers for its HTML payloads
src/lib/api/endpoints.ts  typed endpoint map — add endpoints here, not as strings
src/lib/gtfs/*         zip reader, CSV parser, station list + name index
src/lib/trains/*       identity (number/category/line) and search matching
src/lib/trainSnapshot.ts  what /api/trains serves and when it refuses to
src/lib/time/*         Budapest wall-clock handling
worker/index.ts        the poller: positions, snapshots, GTFS, identity
```

Redis keys: `trains:live` (hash), `trains:snapshot:latest`, `gtfs:stations`,
`gtfs:meta`, `cache:stations:all`, `cache:route:<elviraId>`,
`vonatinfo:identity:<elviraId>`.

## The worker, once a minute

Fetches all positions in one request, derives heading and speed by comparing
with the previous sample, drops vehicles older than 120 minutes, writes the hash
plus a snapshot, and backs off exponentially when upstream fails. On top of that
it spends at most 4 requests a cycle learning train identities, and checks GTFS
hourly (conditionally).

Be frugal with upstream requests. MÁV IP-blocked this server once already, after
the worker issued ~25,000 requests an hour; the site then served 434-day-old
positions for months because nothing noticed.

## Deployment

Push to `main` → GitHub Actions runs the checks → on success it calls Coolify's
deploy API. See DEPLOYMENT.md.
