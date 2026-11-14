import { haversineKm } from './geo'
import type { LegInfo, RoadPref, RouteInfo, Stop } from './types'

type Pt = { lat: number; lng: number }

interface CachedLeg {
  shape: string // encoded polyline, precision 6
  distanceKm: number
  durationMin: number
  prefApplied: boolean
  hasFerry?: boolean
}

export interface LegOptions {
  pref: RoadPref
  avoidFerries: boolean
  /** 0 = suggested route, 1+ = Valhalla alternative */
  choice: number
  /** Points on roads to avoid (snapped to the nearest road by Valhalla) */
  exclude?: Pt[]
}

export const legOptions = (s: Stop): LegOptions => ({
  pref: s.arriveVia ?? 'standard',
  avoidFerries: !!s.avoidFerries,
  choice: s.routeChoice ?? 0,
})

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

const CACHE_KEY = 'roadster.legcache.v2'
const CACHE_MAX = 150
const cache: Map<string, CachedLeg> = (() => {
  try {
    localStorage.removeItem('roadster.legcache.v1') // older format without ferry info
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

const legKey = (a: Pt, b: Pt, o: LegOptions) =>
  `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}|${o.pref}|${o.avoidFerries ? 'noferry' : ''}` +
  `|${o.choice || ''}|${o.exclude?.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';') ?? ''}`

// ---------- Routers ----------

const USE_HIGHWAYS: Record<RoadPref, number> = { avoid: 0, standard: 0.5, prefer: 1 }

/** Valhalla on the FOSSGIS public server: supports motorway preference. */
async function valhalla(a: Pt, b: Pt, o: LegOptions, signal?: AbortSignal): Promise<CachedLeg> {
  const res = await fetch('https://valhalla1.openstreetmap.de/route', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [{ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng }],
      costing: 'auto',
      costing_options: { auto: { use_highways: USE_HIGHWAYS[o.pref], use_ferry: o.avoidFerries ? 0 : 0.5 } },
      units: 'kilometers',
      directions_type: 'none',
      ...(o.choice > 0 ? { alternates: Math.max(2, o.choice) } : {}),
      ...(o.exclude?.length ? { exclude_locations: o.exclude.map((p) => ({ lat: p.lat, lon: p.lng })) } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Valhalla ${res.status}`)
  const data = await res.json()
  const trip = o.choice > 0 ? data.alternates?.[o.choice - 1]?.trip : data.trip
  if (o.choice > 0 && !trip) throw new ChoiceMissing()
  const leg = trip?.legs?.[0]
  if (!leg) throw new Error('Valhalla: no route')
  return {
    shape: leg.shape,
    distanceKm: leg.summary.length,
    durationMin: leg.summary.time / 60,
    prefApplied: true,
    hasFerry: !!leg.summary.has_ferry,
  }
}

/** OSRM demo server: backup only, it ignores motorway and ferry settings. */
async function osrm(a: Pt, b: Pt, o: LegOptions, signal?: AbortSignal): Promise<CachedLeg> {
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
    prefApplied: o.pref === 'standard' && !o.avoidFerries,
  }
}

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError'
class ChoiceMissing extends Error {}

function toLeg(hit: CachedLeg): LegInfo {
  return {
    path: decodePolyline(hit.shape),
    distanceKm: hit.distanceKm,
    durationMin: hit.durationMin,
    estimated: false,
    prefApplied: hit.prefApplied,
    hasFerry: hit.hasFerry,
    retraceKm: 0,
  }
}

async function routeLeg(a: Pt, b: Pt, o: LegOptions, signal?: AbortSignal): Promise<LegInfo> {
  const key = legKey(a, b, o)
  let hit = cache.get(key)
  if (!hit) {
    for (const router of [valhalla, osrm]) {
      try {
        hit = await router(a, b, o, signal)
        break
      } catch (e) {
        if (isAbort(e)) throw e
        // The chosen alternative no longer exists: use the suggested route
        if (e instanceof ChoiceMissing) return { ...(await routeLeg(a, b, { ...o, choice: 0 }, signal)), choiceMissing: true }
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
    return { path: [[a.lat, a.lng], [b.lat, b.lng]], distanceKm: haversineKm(a, b), durationMin: null, estimated: true, prefApplied: false, retraceKm: 0 }
  }
  return toLeg(hit)
}

/** Valhalla only, no fallbacks: used when avoiding earlier roads. Null if there's no such route. */
async function routeLegStrict(a: Pt, b: Pt, o: LegOptions, signal?: AbortSignal): Promise<LegInfo | null> {
  const key = legKey(a, b, o)
  let hit = cache.get(key)
  if (!hit) {
    try {
      hit = await valhalla(a, b, o, signal)
    } catch (e) {
      if (isAbort(e)) throw e
      return null
    }
    cache.set(key, hit)
    saveCache()
  }
  return toLeg(hit)
}

// ---------- Retracing (out-and-back) detection ----------

const CELL = 0.0004 // ~45 m in latitude
const NEAR_KM = 0.04

/** Grid of points along earlier legs, densified so long straight roads aren't missed. */
function buildGrid(paths: [number, number][][]) {
  const grid = new Map<string, Pt[]>()
  const add = (p: Pt) => {
    const k = `${Math.floor(p.lat / CELL)},${Math.floor(p.lng / CELL)}`
    const list = grid.get(k)
    if (list) list.push(p)
    else grid.set(k, [p])
  }
  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const p = { lat: path[i][0], lng: path[i][1] }
      add(p)
      if (i + 1 < path.length) {
        const q = { lat: path[i + 1][0], lng: path[i + 1][1] }
        const steps = Math.floor(haversineKm(p, q) / 0.03)
        for (let s = 1; s < steps; s++) add({ lat: p.lat + ((q.lat - p.lat) * s) / steps, lng: p.lng + ((q.lng - p.lng) * s) / steps })
      }
    }
  }
  return grid
}

function nearGrid(grid: Map<string, Pt[]>, p: Pt) {
  const cy = Math.floor(p.lat / CELL)
  const cx = Math.floor(p.lng / CELL)
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const list = grid.get(`${cy + dy},${cx + dx}`)
      if (list?.some((q) => haversineKm(p, q) < NEAR_KM)) return true
    }
  return false
}

/** How much of `path` repeats earlier roads, and points to exclude to avoid them. */
function retrace(path: [number, number][], grid: Map<string, Pt[]>) {
  if (!grid.size || path.length < 2) return { km: 0, exclude: [] as Pt[] }
  const start = { lat: path[0][0], lng: path[0][1] }
  const end = { lat: path[path.length - 1][0], lng: path[path.length - 1][1] }
  let km = 0
  let sinceLast = Infinity
  const exclude: Pt[] = []
  for (let i = 1; i < path.length; i++) {
    const p = { lat: path[i][0], lng: path[i][1] }
    const seg = haversineKm({ lat: path[i - 1][0], lng: path[i - 1][1] }, p)
    sinceLast += seg
    if (!nearGrid(grid, p)) continue
    km += seg
    // Keep roads near the stops usable: a dead-end stop can only be left the way you came
    if (haversineKm(p, start) < 1.5 || haversineKm(p, end) < 1.5) continue
    if (sinceLast >= 1.5 && exclude.length < 40) {
      exclude.push(p)
      sinceLast = 0
    }
  }
  return { km, exclude }
}

/** True if every leg of this trip is already cached (so no loading state is needed). */
export function routeIsCached(stops: Stop[]) {
  // Legs that avoid retracing depend on earlier legs, so treat them as not cached
  return stops.slice(1).every((s, i) => !s.avoidRetrace && cache.has(legKey(stops[i], s, legOptions(s))))
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
      legs[i] = await routeLeg(a, b, legOptions(b), signal)
    }
  }
  await Promise.all([worker(), worker()])

  // Second pass, in order: measure how much each leg repeats earlier legs, and
  // re-route the ones set to avoid that
  for (let i = 0; i < legs.length; i++) {
    const grid = buildGrid(legs.slice(0, i).filter((l) => !l.estimated).map((l) => l.path))
    const r = retrace(legs[i].path, grid)
    legs[i].retraceKm = r.km
    const [a, b] = pairs[i]
    if (!b.avoidRetrace || legs[i].estimated) continue
    if (r.exclude.length === 0) {
      legs[i].retraceAvoided = r.km > 0.5 ? 'no-alternative' : 'yes'
      continue
    }
    const normal = legs[i]
    const better = await routeLegStrict(a, b, { ...legOptions(b), choice: 0, exclude: r.exclude }, signal)
    if (!better) {
      legs[i].retraceAvoided = 'no-alternative'
      continue
    }
    better.retraceKm = retrace(better.path, grid).km
    better.retraceAvoided = better.retraceKm < normal.retraceKm - 1 ? 'yes' : 'no-alternative'
    better.normalDistanceKm = normal.distanceKm
    better.normalDurationMin = normal.durationMin
    legs[i] = better.retraceAvoided === 'yes' ? better : { ...normal, retraceAvoided: 'no-alternative' }
  }

  const anyEstimated = legs.some((l) => l.durationMin == null)
  return {
    legs,
    distanceKm: legs.reduce((n, l) => n + l.distanceKm, 0),
    durationMin: anyEstimated ? null : legs.reduce((n, l) => n + (l.durationMin ?? 0), 0),
    estimated: legs.some((l) => l.estimated),
  }
}

export interface RouteAlternative {
  index: number
  distanceKm: number
  durationMin: number
  path: [number, number][]
}

/** The suggested route and up to two alternatives for one leg (fetched on demand). */
export async function getAlternatives(a: Pt, b: Stop, signal?: AbortSignal): Promise<RouteAlternative[]> {
  const o = legOptions(b)
  const res = await fetch('https://valhalla1.openstreetmap.de/route', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [{ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng }],
      costing: 'auto',
      costing_options: { auto: { use_highways: USE_HIGHWAYS[o.pref], use_ferry: o.avoidFerries ? 0 : 0.5 } },
      units: 'kilometers',
      directions_type: 'none',
      alternates: 2,
    }),
  })
  if (!res.ok) throw new Error(`Valhalla ${res.status}`)
  const data = await res.json()
  const trips = [data.trip, ...(data.alternates ?? []).map((x: { trip: unknown }) => x.trip)].filter(Boolean)
  return trips.map((t: { legs: { shape: string; summary: { length: number; time: number } }[] }, index: number) => ({
    index,
    distanceKm: t.legs[0].summary.length,
    durationMin: t.legs[0].summary.time / 60,
    path: decodePolyline(t.legs[0].shape),
  }))
}
