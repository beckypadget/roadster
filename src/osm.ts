import { haversineKm } from './geo'
import type { Suggestion } from './discover'
import { overpass } from './overpass'

/**
 * Viewpoints and beaches from OpenStreetMap via the Overpass API. These fill a
 * gap in Wikipedia: most viewpoints and many beaches have no article.
 *
 * The public Overpass servers are often busy, so: try the main server then a
 * mirror, each with a time limit, and keep results on the device (viewpoints
 * and beaches rarely change). Callers treat failure as "not available right now".
 */

type Pt = { lat: number; lng: number }

interface OsmPlace {
  ref: string // e.g. "node/123"
  lat: number
  lng: number
  kind: 'viewpoint' | 'beach' | 'trailhead'
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

async function fetchPlaces(area: string, signal?: AbortSignal): Promise<OsmPlace[]> {
  const query =
    `[out:json][timeout:20];(` +
    `nwr(${area})["tourism"="viewpoint"];` +
    `nwr(${area})["natural"="beach"];` +
    `node(${area})["highway"="trailhead"];` +
    `);out center tags 400;`
  const elements = await overpass(query, signal)
  return elements
    .map((e) => {
      const t = e.tags ?? {}
      const lat = e.lat ?? e.center?.lat
      const lng = e.lon ?? e.center?.lon
      if (lat == null || lng == null) return null
      return {
        ref: `${e.type}/${e.id}`,
        lat,
        lng,
        kind: t.tourism === 'viewpoint' ? 'viewpoint' : t.highway === 'trailhead' ? 'trailhead' : 'beach',
        name: t['name:en'] || t.name,
        description: t.description,
        surface: t.surface,
      } as OsmPlace
    })
    .filter((x): x is OsmPlace => !!x)
}

async function cached(key: string, area: string, signal?: AbortSignal) {
  const hit = recall(key)
  if (hit) return hit
  const places = await fetchPlaces(area, signal)
  remember(key, places)
  return places
}

// ---------- Turning places into suggestions ----------

function describe(p: OsmPlace) {
  if (p.kind === 'viewpoint') return p.description || 'Viewpoint'
  if (p.kind === 'trailhead') return p.description || 'Trailhead'
  if (/^(sand|fine_sand)$/.test(p.surface ?? '')) return 'Sandy beach'
  if (/^(pebblestone|shingle|gravel|stone)$/.test(p.surface ?? '')) return 'Pebble beach'
  return 'Beach'
}

function toSuggestions(places: OsmPlace[], distanceOf: (p: Pt) => number, maxKm: number, keep: (p: Pt) => boolean): Suggestion[] {
  const out: Suggestion[] = []
  for (const p of places) {
    const distanceKm = distanceOf(p)
    if (distanceKm > maxKm || !keep(p)) continue
    const base = p.kind === 'beach' ? (p.name ? 3.3 : 2.6) : p.name ? 3.3 : 2.7
    const fallback = p.kind === 'viewpoint' ? 'Viewpoint' : p.kind === 'trailhead' ? 'Trailhead' : 'Beach'
    out.push({
      id: `osm:${p.ref}`,
      source: 'osm',
      link: `https://www.openstreetmap.org/${p.ref}`,
      title: p.name ?? fallback,
      lat: p.lat,
      lng: p.lng,
      category: p.kind === 'trailhead' ? 'hikes' : 'coast',
      description: describe(p),
      distanceKm,
      score: base + 0.4 - 0.6 * Math.log10(1 + distanceKm),
    })
  }
  // Unnamed places can be numerous: keep the best 15 of them
  const generic = ['Viewpoint', 'Beach', 'Trailhead']
  const named = out.filter((s) => !generic.includes(s.title))
  const unnamed = out.filter((s) => generic.includes(s.title)).sort((a, b) => b.score - a.score).slice(0, 15)
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
export function mergeExtras(wiki: Suggestion[], extras: Suggestion[]): Suggestion[] {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const extra: Suggestion[] = []
  for (const o of extras) {
    const sameName = (w: Suggestion) => norm(w.title) === norm(o.title)
    const dupe =
      wiki.some((w) => haversineKm(w, o) < 0.3 && (sameName(w) || w.category === o.category)) ||
      wiki.some((w) => sameName(w) && (o.noMarker || haversineKm(w, o) < 3)) ||
      extra.some((e) => sameName(e) && haversineKm(e, o) < 1)
    if (dupe) continue
    if (o.title === 'Viewpoint' || o.title === 'Beach' || o.title === 'Trailhead') {
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
