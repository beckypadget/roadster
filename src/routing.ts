import { haversineKm } from './geo'
import type { LegInfo, RoadPref, RouteInfo, Stop } from './types'

type Pt = { lat: number; lng: number }

interface CachedLeg {
  shape: string // encoded polyline, precision 6
  distanceKm: number
  durationMin: number
  prefApplied: boolean
}

// ---------- Polyline decoding (Google format, precision 6 for Valhalla/OSRM polyline6) ----------

export function decodePolyline(str: string, precision = 6): [number, number][] {
  const factor = 10 ** precision
  const out: [number, number][] = []
  let lat = 0
  let lng = 0
  let i = 0
  while (i < str.length) {
    for (const which of [0, 1]) {
      let result = 0
      let shift = 0
      let b: number
      do {
        b = str.charCodeAt(i++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (which === 0) lat += delta
      else lng += delta
    }
    out.push([lat / factor, lng / factor])
  }
  return out
}

// ---------- Leg cache (memory + localStorage, so known routes work offline) ----------

const CACHE_KEY = 'roadster.legcache.v1'
const CACHE_MAX = 150
const cache: Map<string, CachedLeg> = (() => {
  try {
    return new Map(JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'))
  } catch {
    return new Map()
  }
})()

function saveCache() {
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...cache]))
  } catch {
    /* storage full: keep in memory only */
  }
}

const legKey = (a: Pt, b: Pt, pref: RoadPref) =>
  `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}|${pref}`

// ---------- Routers ----------

const USE_HIGHWAYS: Record<RoadPref, number> = { avoid: 0, standard: 0.5, prefer: 1 }

/** Valhalla on the FOSSGIS public server: supports motorway preference. */
async function valhalla(a: Pt, b: Pt, pref: RoadPref, signal?: AbortSignal): Promise<CachedLeg> {
  const res = await fetch('https://valhalla1.openstreetmap.de/route', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [{ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng }],
      costing: 'auto',
      costing_options: { auto: { use_highways: USE_HIGHWAYS[pref] } },
      units: 'kilometers',
      directions_type: 'none',
    }),
  })
  if (!res.ok) throw new Error(`Valhalla ${res.status}`)
  const data = await res.json()
  const leg = data.trip?.legs?.[0]
  if (!leg) throw new Error('Valhalla: no route')
  return { shape: leg.shape, distanceKm: leg.summary.length, durationMin: leg.summary.time / 60, prefApplied: true }
}

/** OSRM demo server: backup only, it ignores motorway preference. */
async function osrm(a: Pt, b: Pt, pref: RoadPref, signal?: AbortSignal): Promise<CachedLeg> {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=polyline6`,
    { signal },
  )
  if (!res.ok) throw new Error(`OSRM ${res.status}`)
  const route = (await res.json()).routes?.[0]
  if (!route) throw new Error('OSRM: no route')
  return {
    shape: route.geometry,
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    prefApplied: pref === 'standard',
  }
}

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError'

async function routeLeg(a: Pt, b: Pt, pref: RoadPref, signal?: AbortSignal): Promise<LegInfo> {
  const key = legKey(a, b, pref)
  let hit = cache.get(key)
  if (!hit) {
    for (const router of [valhalla, osrm]) {
      try {
        hit = await router(a, b, pref, signal)
        break
      } catch (e) {
        if (isAbort(e)) throw e
      }
    }
    if (hit) {
      // Only cache results that honour the preference, so we retry Valhalla later
      if (hit.prefApplied) {
        cache.set(key, hit)
        saveCache()
      }
    }
  }
  if (!hit) {
    return { path: [[a.lat, a.lng], [b.lat, b.lng]], distanceKm: haversineKm(a, b), durationMin: null, estimated: true, prefApplied: false }
  }
  return {
    path: decodePolyline(hit.shape),
    distanceKm: hit.distanceKm,
    durationMin: hit.durationMin,
    estimated: false,
    prefApplied: hit.prefApplied,
  }
}

/** True if every leg of this trip is already cached (so no loading state is needed). */
export function routeIsCached(stops: Stop[]) {
  return stops.slice(1).every((s, i) => cache.has(legKey(stops[i], s, s.arriveVia ?? 'standard')))
}

/**
 * Route every leg separately (each can have its own motorway setting).
 * Runs at most two requests at a time to be polite to the free servers.
 */
export async function getRoute(stops: Stop[], signal?: AbortSignal): Promise<RouteInfo> {
  const pairs = stops.slice(1).map((s, i) => [stops[i], s] as const)
  const legs: LegInfo[] = new Array(pairs.length)
  let next = 0
  const worker = async () => {
    while (next < pairs.length) {
      const i = next++
      const [a, b] = pairs[i]
      legs[i] = await routeLeg(a, b, b.arriveVia ?? 'standard', signal)
    }
  }
  await Promise.all([worker(), worker()])
  const anyEstimated = legs.some((l) => l.durationMin == null)
  return {
    legs,
    distanceKm: legs.reduce((n, l) => n + l.distanceKm, 0),
    durationMin: anyEstimated ? null : legs.reduce((n, l) => n + (l.durationMin ?? 0), 0),
    estimated: legs.some((l) => l.estimated),
  }
}
