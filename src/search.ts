import { haversineKm } from './geo'

export interface PlaceResult {
  name: string
  /** Region / country line shown under the name */
  detail: string
  lat: number
  lng: number
  /** Distance in km to the nearest stop already in the trip, if any */
  nearestKm?: number
  nearestStop?: string
}

interface Candidate extends PlaceResult {
  /** 0–1, how notable the place is */
  importance: number
}

type LatLng = { lat: number; lng: number; name?: string }

const lang = () => (typeof navigator !== 'undefined' ? navigator.language : 'en')

// ---------- Nominatim: best overall relevance, knows alternative names ----------

async function nominatim(query: string, signal?: AbortSignal): Promise<Candidate[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8` +
    `&accept-language=${encodeURIComponent(lang())}&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const data = (await res.json()) as {
    name: string
    display_name: string
    lat: string
    lon: string
    importance?: number
    address?: Record<string, string>
  }[]
  return data.map((d) => {
    const name = d.name || d.display_name.split(',')[0]
    const a = d.address ?? {}
    const detail = uniq([
      a.city || a.town || a.village || a.hamlet,
      a.county,
      a.state,
      a.country,
    ]).filter((x) => x !== name).join(', ')
    return { name, detail, lat: Number(d.lat), lng: Number(d.lon), importance: d.importance ?? 0.2 }
  })
}

// ---------- Photon: location-aware, good for "the one near me" ----------

const PHOTON_EXCLUDE = ['highway', 'railway', 'waterway', 'landuse', 'public_transport', 'power', 'barrier']

const PLACE_IMPORTANCE: Record<string, number> = {
  city: 0.6, town: 0.5, island: 0.5, village: 0.4, suburb: 0.35, hamlet: 0.3, locality: 0.25,
}

async function photon(query: string, near: LatLng | null, signal?: AbortSignal): Promise<Candidate[]> {
  const params = new URLSearchParams({ q: query, limit: '8' })
  const l = lang().slice(0, 2)
  if (['en', 'de', 'fr'].includes(l)) params.set('lang', l)
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lon', String(near.lng))
  }
  PHOTON_EXCLUDE.forEach((t) => params.append('osm_tag', `!${t}`))
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const data = (await res.json()) as {
    features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[]
  }
  return data.features
    .filter((f) => f.properties.name)
    .map((f) => {
      const p = f.properties
      const [lng, lat] = f.geometry.coordinates
      const importance = p.osm_key === 'place' ? (PLACE_IMPORTANCE[p.osm_value] ?? 0.25) : 0.2
      const detail = uniq([p.city || p.town || p.village, p.county, p.state, p.country])
        .filter((x) => x !== p.name)
        .join(', ')
      return { name: p.name, detail, lat, lng, importance }
    })
}

// ---------- Merge and rank ----------

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

function uniq(xs: (string | undefined)[]): string[] {
  return xs.filter((x, i): x is string => !!x && xs.indexOf(x) === i)
}

function nameMatch(name: string, query: string): number {
  const n = norm(name)
  const q = norm(query)
  if (n === q) return 2
  if (n.startsWith(q) || q.includes(n)) return 1
  return 0
}

/**
 * Higher is better. Balances how well the name matches, how notable the place
 * is, and how close it is to the trip. Distance uses a log scale, so 10 km vs
 * 100 km matters as much as 100 km vs 1,000 km, and a very famous place
 * (e.g. Paris, France) can still beat a small nearby namesake.
 */
function score(c: Candidate, query: string): number {
  const distancePenalty = c.nearestKm == null ? 0 : 0.8 * Math.log10(1 + c.nearestKm)
  return nameMatch(c.name, query) + 3 * c.importance - distancePenalty
}

function nearest(c: LatLng, stops: LatLng[]) {
  let best: { km: number; name?: string } | null = null
  for (const s of stops) {
    const km = haversineKm(c, s)
    if (!best || km < best.km) best = { km, name: s.name }
  }
  return best
}

/**
 * Search both geocoders in parallel, then merge, de-duplicate and rank.
 * `stops` are the trip's current stops; results near them rank higher.
 * Photon is biased towards the last stop (where the next one usually goes).
 */
export async function searchPlaces(query: string, stops: LatLng[], signal?: AbortSignal): Promise<PlaceResult[]> {
  const near = stops.length ? stops[stops.length - 1] : null
  const settled = await Promise.allSettled([nominatim(query, signal), photon(query, near, signal)])
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const ok = settled.filter((r): r is PromiseFulfilledResult<Candidate[]> => r.status === 'fulfilled')
  if (ok.length === 0) throw new Error('Search failed')

  const merged: Candidate[] = []
  for (const c of ok.flatMap((r) => r.value)) {
    const dupe = merged.find((m) => norm(m.name) === norm(c.name) && haversineKm(m, c) < 5)
    if (dupe) {
      dupe.importance = Math.max(dupe.importance, c.importance)
      if (!dupe.detail) dupe.detail = c.detail
      continue
    }
    const n = nearest(c, stops)
    merged.push({ ...c, nearestKm: n?.km, nearestStop: n?.name })
  }

  return merged
    .map((c) => ({ c, s: score(c, query) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map(({ c }) => ({
      name: c.name, detail: c.detail, lat: c.lat, lng: c.lng, nearestKm: c.nearestKm, nearestStop: c.nearestStop,
    }))
}
