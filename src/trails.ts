import { haversineKm } from './geo'
import type { Suggestion } from './discover'

/**
 * Hiking routes from Waymarked Trails (hiking.waymarkedtrails.org), which is
 * built on OpenStreetMap hiking relations. Its API uses Web Mercator (EPSG:3857)
 * coordinates.
 *
 * - Local and regional walks: we fetch details for the top few to get the
 *   trailhead (start of the route), length and whether it's circular.
 * - National long-distance routes (e.g. West Highland Way) have huge geometry,
 *   so we list them as "passes through this area" without a map marker.
 * - International routes (E-paths etc.) are skipped: too broad to be useful.
 */

const API = 'https://hiking.waymarkedtrails.org/api/v1'
const MAX_DETAILS = 15
type Pt = { lat: number; lng: number }

const R = 6378137
const toMerc = (lng: number, lat: number) => [(lng * Math.PI * R) / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))]
const fromMerc = (x: number, y: number): Pt => ({
  lng: (x / R) * (180 / Math.PI),
  lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
})

interface ListItem {
  id: number
  name?: string
  group: 'INT' | 'NAT' | 'REG' | 'LOC' | string
  itinerary?: string[]
}

interface TrailInfo {
  start: Pt
  lengthKm: number
  circular: boolean
}

// ---------- Caches ----------

const listCache = new Map<string, ListItem[]>()
const DETAIL_KEY = 'roadster.trailcache.v2'
const details: Map<number, TrailInfo> = (() => {
  try {
    localStorage.removeItem('roadster.trailcache.v1') // older format
    return new Map(JSON.parse(localStorage.getItem(DETAIL_KEY) || '[]'))
  } catch {
    return new Map()
  }
})()
function saveDetails() {
  while (details.size > 400) details.delete(details.keys().next().value!)
  try {
    localStorage.setItem(DETAIL_KEY, JSON.stringify([...details]))
  } catch {
    /* memory only */
  }
}

// ---------- API calls ----------

async function listByArea(minLat: number, minLng: number, maxLat: number, maxLng: number, signal?: AbortSignal) {
  const [x1, y1] = toMerc(minLng, minLat)
  const [x2, y2] = toMerc(maxLng, maxLat)
  const bbox = [x1, y1, x2, y2].map((v) => Math.round(v)).join(',')
  const hit = listCache.get(bbox)
  if (hit) return hit
  const res = await fetch(`${API}/list/by_area?bbox=${bbox}&limit=60`, { signal })
  if (!res.ok) throw new Error(`Waymarked Trails ${res.status}`)
  const items: ListItem[] = (await res.json()).results ?? []
  listCache.set(bbox, items)
  return items
}

async function trailInfo(id: number, signal?: AbortSignal): Promise<TrailInfo | null> {
  const hit = details.get(id)
  if (hit) return hit
  const res = await fetch(`${API}/details/relation/${id}`, { signal })
  if (!res.ok) return null
  const d = await res.json()
  const ways = d.route?.main?.[0]?.ways ?? []
  const first = ways[0]?.geometry?.coordinates?.[0] as [number, number] | undefined
  const lastCoords = ways[ways.length - 1]?.geometry?.coordinates as [number, number][] | undefined
  const last = lastCoords?.[lastCoords.length - 1]
  let start: Pt | null = first ? fromMerc(first[0], first[1]) : null
  const end: Pt | null = last ? fromMerc(last[0], last[1]) : null
  if (!start && Array.isArray(d.bbox)) start = fromMerc((d.bbox[0] + d.bbox[2]) / 2, (d.bbox[1] + d.bbox[3]) / 2)
  if (!start) return null
  // Circular if the route ends where it starts (the API's `linear` flag doesn't mean that)
  const circular = !!end && haversineKm(start, end) < 0.5
  const info = { start, lengthKm: (d.route?.length ?? 0) / 1000, circular }
  details.set(id, info)
  saveDetails()
  return info
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await fn(items[next++])
    }),
  )
}

// ---------- Building suggestions ----------

const link = (id: number) => `https://hiking.waymarkedtrails.org/#route?type=relation&id=${id}`
const fmtKm = (km: number) => (km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`)

async function build(
  items: ListItem[],
  distanceOf: (p: Pt) => number,
  maxKm: number,
  keep: (p: Pt) => boolean,
  anchor: Pt,
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  const seen = new Set<number>()
  const unique = items.filter((i) => i.name && i.group !== 'INT' && !seen.has(i.id) && seen.add(i.id))
  const longDistance = unique.filter((i) => i.group === 'NAT')
  const local = unique.filter((i) => i.group !== 'NAT').slice(0, MAX_DETAILS)

  const out: Suggestion[] = longDistance.map((i) => ({
    id: `wmt:${i.id}`,
    source: 'osm',
    link: link(i.id),
    title: i.name!,
    lat: anchor.lat,
    lng: anchor.lng,
    category: 'hikes',
    description: i.itinerary?.length
      ? `Long-distance trail: ${i.itinerary[0]} to ${i.itinerary[i.itinerary.length - 1]}`
      : 'Long-distance trail passing through this area',
    noMarker: true,
    distanceKm: 0,
    // Below nearby day walks: on a road trip those are usually more useful
    score: 3.0,
  }))

  await pool(local, 3, async (i) => {
    if (signal?.aborted) return
    const info = await trailInfo(i.id, signal).catch(() => null)
    if (!info) return
    // Long routes pass through rather than being a walk from here
    if (info.lengthKm > 40) {
      out.push({
        id: `wmt:${i.id}`, source: 'osm', link: link(i.id), title: i.name!, lat: anchor.lat, lng: anchor.lng,
        category: 'hikes', description: `Long-distance trail (${fmtKm(info.lengthKm)})${i.itinerary?.length ? `: ${i.itinerary[0]} to ${i.itinerary[i.itinerary.length - 1]}` : ''}`,
        noMarker: true, distanceKm: 0, score: 2.9,
      })
      return
    }
    const distanceKm = distanceOf(info.start)
    if (distanceKm > maxKm || !keep(info.start)) return
    const kind = info.circular ? 'circular walk' : 'walk'
    out.push({
      id: `wmt:${i.id}`,
      source: 'osm',
      link: link(i.id),
      title: i.name!,
      lat: info.start.lat,
      lng: info.start.lng,
      category: 'hikes',
      description: info.lengthKm ? `${fmtKm(info.lengthKm)} ${kind}, starts here` : `Waymarked ${kind}`,
      distanceKm,
      score: (i.group === 'REG' ? 3.4 : 3.1) + 0.5 - 0.6 * Math.log10(1 + distanceKm),
    })
  })
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return out
}

/** Hiking routes within ~25 km of a stop. */
export async function trailsNear(stop: Pt, signal?: AbortSignal): Promise<Suggestion[]> {
  const dLat = 0.23
  const dLng = 0.23 / Math.cos((stop.lat * Math.PI) / 180)
  const items = await listByArea(stop.lat - dLat, stop.lng - dLng, stop.lat + dLat, stop.lng + dLng, signal)
  return build(items, (p) => haversineKm(stop, p), 26, () => true, stop, signal)
}

/** Hiking routes starting within ~8 km of a leg's road (searches up to 8 boxes along it). */
export async function trailsAlong(path: [number, number][], signal?: AbortSignal): Promise<Suggestion[]> {
  if (path.length < 2) return []
  const pts = path.map(([lat, lng]) => ({ lat, lng }))
  let total = 0
  for (let i = 1; i < pts.length; i++) total += haversineKm(pts[i - 1], pts[i])
  const chunkKm = Math.max(30, total / 8)
  // Split the path into chunks and search a padded box around each
  const boxes: [number, number, number, number][] = []
  let box: [number, number, number, number] | null = null
  let acc = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    box = box ? [Math.min(box[0], p.lat), Math.min(box[1], p.lng), Math.max(box[2], p.lat), Math.max(box[3], p.lng)] : [p.lat, p.lng, p.lat, p.lng]
    if (i > 0) acc += haversineKm(pts[i - 1], p)
    if (acc >= chunkKm || i === pts.length - 1) {
      boxes.push(box)
      box = [p.lat, p.lng, p.lat, p.lng]
      acc = 0
    }
  }
  const pad = 0.07
  const lists = await Promise.allSettled(
    boxes.map(([a, b, c, d]) => listByArea(a - pad, b - pad * 1.8, c + pad, d + pad * 1.8, signal)),
  )
  if (lists.every((l) => l.status === 'rejected')) throw new Error('Waymarked Trails unavailable')
  // Interleave the sections so the detail budget is spread along the whole leg,
  // not spent on walks near the start
  const queues = lists.map((l) => (l.status === 'fulfilled' ? [...l.value] : []))
  const items: ListItem[] = []
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) items.push(q.shift()!)

  const step = Math.max(1, Math.floor(pts.length / 800))
  const verts = pts.filter((_, i) => i % step === 0)
  const offRoute = (p: Pt) => Math.min(...verts.map((v) => haversineKm(v, p)))
  const start = pts[0]
  const end = pts[pts.length - 1]
  const notAtEnds = (p: Pt) => haversineKm(p, start) > 3 && haversineKm(p, end) > 3
  const mid = pts[Math.floor(pts.length / 2)]
  return build(items, offRoute, 8, notAtEnds, mid, signal)
}
