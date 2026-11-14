import { haversineKm } from './geo'
import type { Suggestion } from './discover'

/**
 * Viewpoints and beaches from OpenStreetMap via the Overpass API. These fill a
 * gap in Wikipedia: most viewpoints and many beaches have no article.
 *
 * The public Overpass servers are often busy, so: try the main server then a
 * mirror, each with a time limit, and keep results on the device (viewpoints
 * and beaches rarely change). Callers treat failure as "not available right now".
 */

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const TIMEOUT_MS = 15000

type Pt = { lat: number; lng: number }

interface OsmPlace {
  ref: string // e.g. "node/123"
  lat: number
  lng: number
  kind: 'viewpoint' | 'beach'
  name?: string
  description?: string
  surface?: string
}

// ---------- Cache (localStorage) ----------

const CACHE_KEY = 'roadster.osmcache.v1'
const CACHE_MAX = 40
const CACHE_DAYS = 30
type CacheEntry = { at: number; places: OsmPlace[] }
const cache: Map<string, CacheEntry> = (() => {
  try {
    return new Map(JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'))
  } catch {
    return new Map()
  }
})()
function remember(key: string, places: OsmPlace[]) {
  cache.delete(key)
  cache.set(key, { at: Date.now(), places })
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...cache]))
  } catch {
    /* full: memory only */
  }
}
function recall(key: string): OsmPlace[] | null {
  const e = cache.get(key)
  return e && Date.now() - e.at < CACHE_DAYS * 864e5 ? e.places : null
}

// ---------- Fetching ----------

function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const t = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, t]) : t
}

async function overpass(area: string, signal?: AbortSignal): Promise<OsmPlace[]> {
  const query =
    `[out:json][timeout:20];(` +
    `nwr(${area})["tourism"="viewpoint"];` +
    `nwr(${area})["natural"="beach"];` +
    `);out center tags 400;`
  let lastError: unknown
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: withTimeout(signal, TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      const data = await res.json()
      return (data.elements as { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[])
        .map((e) => {
          const t = e.tags ?? {}
          const lat = e.lat ?? e.center?.lat
          const lng = e.lon ?? e.center?.lon
          if (lat == null || lng == null) return null
          return {
            ref: `${e.type}/${e.id}`,
            lat,
            lng,
            kind: t.tourism === 'viewpoint' ? 'viewpoint' : 'beach',
            name: t['name:en'] || t.name,
            description: t.description,
            surface: t.surface,
          } as OsmPlace
        })
        .filter((x): x is OsmPlace => !!x)
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e
    }
  }
  throw lastError ?? new Error('Overpass unavailable')
}

async function cached(key: string, area: string, signal?: AbortSignal) {
  const hit = recall(key)
  if (hit) return hit
  const places = await overpass(area, signal)
  remember(key, places)
  return places
}

// ---------- Turning places into suggestions ----------

function describe(p: OsmPlace) {
  if (p.kind === 'viewpoint') return p.description || 'Viewpoint'
  if (/^(sand|fine_sand)$/.test(p.surface ?? '')) return 'Sandy beach'
  if (/^(pebblestone|shingle|gravel|stone)$/.test(p.surface ?? '')) return 'Pebble beach'
  return 'Beach'
}

function toSuggestions(places: OsmPlace[], distanceOf: (p: Pt) => number, maxKm: number, keep: (p: Pt) => boolean): Suggestion[] {
  const out: Suggestion[] = []
  for (const p of places) {
    const distanceKm = distanceOf(p)
    if (distanceKm > maxKm || !keep(p)) continue
    const base = p.kind === 'viewpoint' ? (p.name ? 3.3 : 2.7) : p.name ? 3.3 : 2.6
    out.push({
      id: `osm:${p.ref}`,
      source: 'osm',
      link: `https://www.openstreetmap.org/${p.ref}`,
      title: p.name ?? (p.kind === 'viewpoint' ? 'Viewpoint' : 'Beach'),
      lat: p.lat,
      lng: p.lng,
      category: 'coast',
      description: describe(p),
      distanceKm,
      score: base + 0.4 - 0.6 * Math.log10(1 + distanceKm),
    })
  }
  // Unnamed places can be numerous: keep the best 15 of them
  const named = out.filter((s) => !['Viewpoint', 'Beach'].includes(s.title))
  const unnamed = out.filter((s) => ['Viewpoint', 'Beach'].includes(s.title)).sort((a, b) => b.score - a.score).slice(0, 15)
  return [...named, ...unnamed]
}

/** Viewpoints and beaches within ~25 km of a stop. */
export async function osmNear(stop: Pt, signal?: AbortSignal): Promise<Suggestion[]> {
  const key = `near:${stop.lat.toFixed(2)},${stop.lng.toFixed(2)}`
  const places = await cached(key, `around:25000,${stop.lat.toFixed(4)},${stop.lng.toFixed(4)}`, signal)
  return toSuggestions(places, (p) => haversineKm(stop, p), 26, () => true)
}

/** Viewpoints and beaches within ~8 km of a leg's road. */
export async function osmAlong(path: [number, number][], signal?: AbortSignal): Promise<Suggestion[]> {
  if (path.length < 2) return []
  // Overpass "around" accepts a polyline: send ~1 point every few km (max 120)
  let len = 0
  for (let i = 1; i < path.length; i++) len += haversineKm({ lat: path[i - 1][0], lng: path[i - 1][1] }, { lat: path[i][0], lng: path[i][1] })
  const spacing = Math.max(3, len / 120)
  const pts: [number, number][] = [path[0]]
  let acc = 0
  for (let i = 1; i < path.length; i++) {
    acc += haversineKm({ lat: path[i - 1][0], lng: path[i - 1][1] }, { lat: path[i][0], lng: path[i][1] })
    if (acc >= spacing || i === path.length - 1) {
      pts.push(path[i])
      acc = 0
    }
  }
  const line = pts.map(([a, b]) => `${a.toFixed(4)},${b.toFixed(4)}`).join(',')
  const key = `along:${pts[0].join()}>${pts[pts.length - 1].join()}:${pts.length}`
  const places = await cached(key, `around:8000,${line}`, signal)

  const step = Math.max(1, Math.floor(path.length / 800))
  const verts = path.filter((_, i) => i % step === 0).map(([lat, lng]) => ({ lat, lng }))
  const offRoute = (p: Pt) => Math.min(...verts.map((v) => haversineKm(v, p)))
  const start = { lat: path[0][0], lng: path[0][1] }
  const end = { lat: path[path.length - 1][0], lng: path[path.length - 1][1] }
  const notAtEnds = (p: Pt) => haversineKm(p, start) > 3 && haversineKm(p, end) > 3
  return toSuggestions(places, offRoute, 8, notAtEnds)
}

/**
 * Merge OSM places into Wikipedia suggestions: drop OSM places that duplicate a
 * Wikipedia one (same name, or a coast/view article within 300 m), and give
 * unnamed places a useful label from the nearest notable place.
 */
export function mergeOsm(wiki: Suggestion[], osm: Suggestion[]): Suggestion[] {
  const norm = (x: string) => x.toLowerCase().trim()
  const extra: Suggestion[] = []
  for (const o of osm) {
    const dupe = wiki.some(
      (w) => haversineKm(w, o) < 0.3 && (norm(w.title) === norm(o.title) || w.category === 'coast'),
    ) || wiki.some((w) => norm(w.title) === norm(o.title) && haversineKm(w, o) < 3)
    if (dupe) continue
    if (o.title === 'Viewpoint' || o.title === 'Beach') {
      let best: Suggestion | null = null
      let bestKm = 6
      for (const w of wiki) {
        const km = haversineKm(w, o)
        if (km < bestKm) {
          best = w
          bestKm = km
        }
      }
      if (best) o.title = `${o.title} near ${best.title}`
    }
    extra.push(o)
  }
  return [...wiki, ...extra].sort((a, b) => b.score - a.score)
}
