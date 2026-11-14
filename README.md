# Roadster

A road-trip planner that installs as a Progressive Web App (PWA) on phones and laptops.

## Features
- Create trips and add stops by searching for places. Search combines Nominatim (best overall matches) and Photon (location-aware), and ranks results by name match, how notable the place is, and distance from your stops (`src/search.ts`)
- Driving route, distance and drive time on a map (OSRM demo server; falls back to a dashed straight line if it's unavailable)
- Reorder stops, set nights per stop, add notes, and see arrival dates from a start date
- Switch between km and miles
- Trips are saved on the device (localStorage). Map tiles you've viewed are cached for weak-signal use.

## Develop
```bash
npm install
npm run dev        # http://localhost:5173 (service worker is off in dev)
npm run build      # type-check and build to dist/
npm run preview    # serve the production build with the service worker on
npm run lint
```

## Structure
- `src/App.tsx`: layout, current trip, route fetching
- `src/components/`: `TripList`, `TripView`, `StopSearch`, `TripMap`
- `src/geo.ts`: routing and distance helpers
- `src/search.ts`: place search and ranking
- `src/storage.ts`: trip persistence
- `vite.config.ts`: PWA manifest and caching rules
- `public/logo.svg`: app icon source. Regenerate PNGs with `npx @vite-pwa/assets-generator --preset minimal-2023 public/logo.svg`

## Hosting
Live at https://roadster.beckypadget96.workers.dev/ on Cloudflare Workers (static assets, see `wrangler.jsonc`).
Cloudflare rebuilds and redeploys automatically on every push to `main` on GitHub.

## Installing on a phone
Open the live address, then:
- iPhone (Safari): Share → Add to Home Screen
- Android (Chrome): menu → Install app
