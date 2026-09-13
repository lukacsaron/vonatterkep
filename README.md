# VonatTérkép

A live map of every train running on the Hungarian rail network, written over a weekend after MÁV pulled Vonatinfó offline.

## Why it exists

In June 2025 MÁV shut down Vonatinfó, the public train-tracking service. Holavonat.hu appeared as a replacement and immediately got caught up in a political argument. I am a hobby railfan who writes software for a living, so I built a third option.

From `specifications/vonatterkep_ki_vagyok.md`:

> No political motivation drove me, I am neither a fanatical activist nor an enemy of MÁV. Just someone who thinks passengers have a right to know where their train is.

## What it does

- Every active train on a Mapbox GL map, coloured by delay
- Tap a train for its stopping pattern, live delay and ETA per station
- Station pages with departure and arrival boards
- Global search across trains and stations, keyboard-driven
- Locate-me button that centres on your nearest station
- MNR2007, the typeface MÁV uses on its own platform displays

Route ETA labels went through several rewrites for readability at arm's length, since a lot of the people who lost Vonatinfó are not twenty-five.

## Architecture

```
Next.js 15 (App Router) on a custom Node server (server.js)
  ├── src/lib/api/mav.ts      MÁV EMMA API client + transformers
  ├── src/lib/redis.ts        response cache
  ├── src/app/api/*           REST layer the frontend talks to
  └── socket.io               pushes position updates to open maps

worker/                       background poller, built separately
                              via tsconfig.worker.json
```

The worker polls MÁV **at most once per minute** and everything else reads from Redis. That ceiling is deliberate: a hobby project should not add load to a public operator's systems. Speeds arrive in m/s and get converted to km/h on the way out.

## Run it

```bash
npm install
echo "NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here" > .env.local
npm run dev                  # http://localhost:3000
```

Separately, for live positions:

```bash
npm run dev:worker
```

Needs a Redis instance and a Mapbox account. `docker-compose.yml` brings up both the app and Redis.

## A note on the Mapbox token

Early commits hardcoded a Mapbox public token (`pk.…`) in `src/app/components/Map/`. Mapbox public tokens are meant to ship in client bundles and carry no write access, so nothing here is a private key. The current code reads `NEXT_PUBLIC_MAPBOX_TOKEN` from the environment. If you fork this, use your own token and set a URL restriction on it in the Mapbox dashboard.

## Pages

| Route | What's there |
|-------|--------------|
| `/` | the map |
| `/stations/[stationId]` | departure board |
| `/search` | train and station search |
| `/mi-ez-itt` | what this is |
| `/ki-vagyok` | who built it and why |

## Status

Built 23 June to 14 July 2025, 65 commits, then parked. Treat it as a snapshot of a fast build rather than maintained software.

## License

MIT. Timetable data belongs to MÁV.
