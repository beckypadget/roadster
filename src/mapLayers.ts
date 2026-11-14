import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { overpassLikelyDown, overpass } from './overpass'

/**
 * Data for the map's toggleable layers.
 *
 * Car parks come from OpenFreeMap vector tiles (OpenStreetMap data on a CDN):
 * reliable and complete, but only at street-level zoom (tile zoom 14), and
 * without access/fee tags.
 *
 * Overnight van spots need tags the tiles don't carry (motorhome=yes, fees,
 * facilities), so they come from Overpass, falling back to plain campsites
 * from the tiles when Overpass is busy.
 */

export type Bounds = { south: number; west: number; north: number; east: number }

export interface CarPark {
  id: string
  lat: number
  lng: number
  name?: string
}

export type VanKind = 'motorhome_site' | 'campsite_vans' | 'campsite' | 'parking' | 'services'

export interface VanSpot {
  id: string
  lat: number
  lng: number
  name?: string
  kind: VanKind
  /** Short facts for the popup, e.g. "Fee", "Toilets", "Max stay 24 h" */
  facts: string[]
  website?: string
  link?: string
}

/** Short names for unnamed places (used as the popup heading and stop name) */
export const VAN_SHORT: Record<VanKind, string> = {
  motorhome_site: 'Motorhome site',
  campsite_vans: 'Campsite',
  campsite: 'Campsite',
  parking: 'Motorhome parking',
  services: 'Motorhome services',
}

export const VAN_LABELS: Record<VanKind, string> = {
  motorhome_site: 'Motorhome & caravan site',
  campsite_vans: 'Campsite, vans welcome',
  campsite: 'Campsite (check vans are allowed)',
  parking: 'Car park, motorhomes allowed',
  services: 'Motorhome services (waste & water)',
}

// ---------- Vector tiles ----------

const TILE_ZOOM = 14
/** Car parks are only in the tiles at zoom 14, so only show them when zoomed in this far */
export const CAR_PARK_MIN_ZOOM = 13
const MAX_TILES = 36

let template: Promise<string> | null = null
function tileTemplate() {
  template ??= fetch('https://tiles.openfreemap.org/planet')
    .then((r) => r.json())
    .then((j) => j.tiles[0] as string)
    .catch((e) => {
      template = null
      throw e
    })
  return template
}

const tileXY = (lat: number, lng: number, z: number) => {
  const n = 2 ** z
  const r = (lat * Math.PI) / 180
  return [
    Math.floor(((lng + 180) / 360) * n),
    Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n),
  ]
}

interface TilePoi {
  lat: number
  lng: number
  cls: string
  name?: string
}
const tileCache = new Map<string, Promise<TilePoi[]>>()

function loadTile(tpl: string, x: number, y: number): Promise<TilePoi[]> {
  const key = `${x}/${y}`
  let p = tileCache.get(key)
  if (!p) {
    p = fetch(tpl.replace('{z}', String(TILE_ZOOM)).replace('{x}', String(x)).replace('{y}', String(y)))
      .then((r) => {
        if (!r.ok) throw new Error(`tile ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => {
        const layer = new VectorTile(new PbfReader(new Uint8Array(buf))).layers.poi
        const out: TilePoi[] = []
        for (let i = 0; i < (layer?.length ?? 0); i++) {
          const f = layer.feature(i)
          const cls = String(f.properties.class)
          if (cls !== 'parking' && cls !== 'campsite') continue
          const g = f.toGeoJSON(x, y, TILE_ZOOM).geometry
          if (g.type !== 'Point') continue
          const [lng, lat] = g.coordinates
          const name = (f.properties['name:en'] ?? f.properties.name) as string | undefined
          out.push({ lat, lng, cls, name })
        }
        return out
      })
      .catch((e) => {
        tileCache.delete(key) // allow retry
        throw e
      })
    tileCache.set(key, p)
    while (tileCache.size > 300) tileCache.delete(tileCache.keys().next().value!)
  }
  return p
}

async function tilePois(b: Bounds): Promise<TilePoi[]> {
  const [x1, y1] = tileXY(b.north, b.west, TILE_ZOOM)
  const [x2, y2] = tileXY(b.south, b.east, TILE_ZOOM)
  if ((x2 - x1 + 1) * (y2 - y1 + 1) > MAX_TILES) throw new Error('zoom in')
  const tpl = await tileTemplate()
  const jobs: Promise<TilePoi[]>[] = []
  for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) jobs.push(loadTile(tpl, x, y))
  const results = await Promise.allSettled(jobs)
  if (results.every((r) => r.status === 'rejected')) throw new Error('tiles unavailable')
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

/** Names that suggest the public can't use it */
const NOT_PUBLIC = /\b(private|staff|residents?|permit holders|customers only|patrons|employees|police|hospital staff)\b/i

export async function carParksIn(b: Bounds): Promise<CarPark[]> {
  const pois = await tilePois(b)
  return pois
    .filter((p) => p.cls === 'parking' && !(p.name && NOT_PUBLIC.test(p.name)))
    .map((p) => ({ id: `cp:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`, lat: p.lat, lng: p.lng, name: p.name }))
}

// ---------- Overnight van spots ----------

export const VAN_MIN_ZOOM = 9
export { overpassLikelyDown }
const vanCache = new Map<string, VanSpot[]>()

function facts(t: Record<string, string>): string[] {
  const f: string[] = []
  if (t.fee === 'no') f.push('Free')
  else if (t.fee === 'yes' || t.charge) f.push(t.charge ? `Fee: ${t.charge}` : 'Fee')
  if (t.maxstay) f.push(`Max stay ${t.maxstay}`)
  if (t.toilets === 'yes') f.push('Toilets')
  if (t.shower === 'yes') f.push('Showers')
  if (t.drinking_water === 'yes' || t.water_point === 'yes') f.push('Water')
  if (t.power_supply === 'yes' || t.power_supply) f.push(t.power_supply === 'no' ? '' : 'Electric hook-up')
  if (t.sanitary_dump_station === 'yes') f.push('Waste disposal')
  if (t.opening_hours) f.push(`Open ${t.opening_hours}`)
  if (t.capacity) f.push(`${t.capacity} spaces`)
  return f.filter(Boolean)
}

function vanKind(t: Record<string, string>): VanKind | null {
  if (t.tourism === 'caravan_site') return 'motorhome_site'
  if (t.tourism === 'camp_site') return /yes|designated/.test(`${t.motorhome} ${t.caravans}`) ? 'campsite_vans' : 'campsite'
  if (t.amenity === 'parking') return 'parking'
  if (t.amenity === 'sanitary_dump_station' || t.amenity === 'water_point') return 'services'
  return null
}

/** Overnight spots with van details, from Overpass. */
export async function vanSpotsDetailed(b: Bounds, signal?: AbortSignal): Promise<VanSpot[]> {
  const bbox = `${b.south.toFixed(3)},${b.west.toFixed(3)},${b.north.toFixed(3)},${b.east.toFixed(3)}`
  const hit = vanCache.get(bbox)
  if (hit) return hit
  const query =
    `[out:json][timeout:20];(` +
    `nwr["tourism"="caravan_site"](${bbox});` +
    `nwr["tourism"="camp_site"]["motorhome"!="no"]["caravans"!="no"](${bbox});` +
    `nwr["amenity"="parking"]["motorhome"~"^(yes|designated)$"](${bbox});` +
    `node["amenity"="sanitary_dump_station"](${bbox});` +
    `);out center tags 500;`
  const els = await overpass(query, signal)
  const spots = els.flatMap((e): VanSpot[] => {
    const tags = e.tags ?? {}
    const kind = vanKind(tags)
    const lat = e.lat ?? e.center?.lat
    const lng = e.lon ?? e.center?.lon
    if (!kind || lat == null || lng == null) return []
    return [{
      id: `osm:${e.type}/${e.id}`,
      lat, lng, kind,
      name: tags['name:en'] || tags.name,
      facts: facts(tags),
      website: tags.website || tags['contact:website'],
      link: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    }]
  })
  vanCache.set(bbox, spots)
  return spots
}

/** Plain campsites from the map tiles: instant, but no van details (zoomed in only). */
export async function vanSpotsBasic(b: Bounds): Promise<VanSpot[]> {
  const pois = await tilePois(b)
  return pois
    .filter((p) => p.cls === 'campsite')
    .map((p) => ({
      id: `vt:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`,
      lat: p.lat, lng: p.lng, name: p.name, kind: 'campsite' as VanKind, facts: [],
    }))
}

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`
