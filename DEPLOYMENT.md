# Deployment

Production runs on a Coolify-managed Docker host: one container with the Next.js
standalone server and the background worker (`start.sh` runs both; if either
dies the container exits and Coolify restarts it), plus a Coolify-managed Redis.

## Pipeline

Push to `main` → GitHub Actions (`.github/workflows/ci.yml`):

1. `checks` — `npm ci`, both typechecks (`tsc --noEmit` and
   `tsconfig.worker.json`), `npm run check:api`, a production build, and a guard
   that fails if `rootMainFiles` contains a `.css` entry.
2. `deploy` — only after `checks` pass, POSTs to Coolify's deploy API with the
   `COOLIFY_API_TOKEN` secret.

Coolify's own deploy-on-push is off, so nothing reaches production without the
checks. Two failed builds once left the site down for 25 hours; that is what
this gate is for.

## Environment variables

Build time (Next inlines them, so they must be marked "Available at Buildtime"):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | public token, URL-restricted to the site's domains |
| `NEXT_PUBLIC_API_URL` | may be the bare origin; the client appends `/api` itself |

Runtime only — **never** mark these build-time:

| Variable | Notes |
|---|---|
| `REDIS_URL` | contains a password |
| `ADMIN_API_TOKEN` | guards `/api/admin/*`; unset means those endpoints refuse everything |
| `MAV_GTFS_USER`, `MAV_GTFS_PASSWORD` | MÁV GTFS download credentials |
| `PORT`, `NODE_ENV` | |

`NODE_ENV=production` marked build-time is what once broke the build: Coolify
injects build-time vars as `ARG` lines above `npm ci`, so npm skipped
devDependencies and the build failed with misleading "module not found" errors.

## Health

`/api/health` is the container healthcheck. It returns **200 even when
degraded** (Redis down, data stale) and 503 only when the app itself is broken —
a 503 makes the orchestrator destroy a working container over a dependency
outage. It reports the age of the train data, so staleness is visible.

`curl -I https://vasutterkep.hu/api/trains` shows `X-Data-Source`
(`live`/`snapshot`/`none`), `X-Data-Age-Seconds` and `X-Data-Reason`.

## Checks after a deploy

```bash
./scripts/verify-deployment.sh            # /api/health, /api/stations, /api/trains
curl -sI https://vasutterkep.hu/api/trains | grep x-data
```

Redis must be up **before** the app deploys: `/api/health` talks to Redis, and a
Redis outage during the healthcheck window fails the deployment.
