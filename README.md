# Roadster

A road-trip planner that installs as a Progressive Web App (PWA) on phones and laptops.

## Features
- Create trips and add stops by searching for places. Search combines Nominatim (best overall matches) and Photon (location-aware), and ranks results by name match, how notable the place is, and distance from your stops (`src/search.ts`)
- Driving route on a map, routed leg by leg with Valhalla (FOSSGIS public server). Each leg can avoid, use standard, or prefer motorways, can avoid ferries, and shows its own distance, time and whether it includes a ferry. Legs are cached on the device; OSRM is the backup router, then a dashed straight line (`src/routing.ts`)
- Drag stops to reorder them (grip handle; works with touch and keyboard), set nights per stop, add notes, and see arrival dates from a start date
- Discover places to visit near each stop ("Things to do nearby") and close to the road on each leg ("Places on the way"): castles and houses, history, views and coast, nature, hikes and walks, scenic drives, museums and attractions. Data and photos from Wikipedia's location search (`src/discover.ts`), plus hiking routes from Waymarked Trails (`src/trails.ts`: trailhead, length, circular or not; long-distance routes listed as passing through) and viewpoints, beaches and trailheads from OpenStreetMap via Overpass (`src/osm.ts`; cached on the device, and the panel works without it when Overpass is busy). Save a place to a stop's plans (tick it off when visited) or add it as a new stop
- Map layers you can toggle: **Car parks** (every car park, from OpenFreeMap vector tiles, shown when zoomed in) and **Overnight** spots for vans (motorhome/caravan sites, campsites that take vans, car parks that allow motorhomes, waste/water points; from Overpass, falling back to plain campsites from the tiles when Overpass is busy). Popups have directions and "Add as stop" (`src/mapLayers.ts`, `src/components/MapLayers.tsx`)
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
- `src/overpass.ts`: shared Overpass access (mirror fallback, cool-off when busy)
- `src/discover.ts`: suggestions (Wikipedia geosearch, categorising and ranking)
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
