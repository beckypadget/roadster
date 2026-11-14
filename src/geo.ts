import type { RouteInfo, Stop } from './types'

export interface PlaceResult {
  name: string
  fullName: string
  lat: number
  lng: number
}

/** Place search via OpenStreetMap Nominatim (free; keep to ~1 request/second). */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = (await res.json()) as { name: string; display_name: string; lat: string; lon: string }[]
  return data.map((d) => ({
    name: d.name || d.display_name.split(',')[0],
    fullName: d.display_name,
    lat: Number(d.lat),
    lng: Number(d.lon),
  }))
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function straightLine(stops: Stop[]): RouteInfo {
  let km = 0
  for (let i = 1; i < stops.length; i++) km += haversineKm(stops[i - 1], stops[i])
  return { path: stops.map((s) => [s.lat, s.lng]), distanceKm: km, durationMin: null, estimated: true }
}

/**
 * Driving route via the public OSRM demo server. It's fine for personal use but
 * has no uptime guarantee, so we fall back to straight lines when it fails.
 */
export async function getRoute(stops: Stop[], signal?: AbortSignal): Promise<RouteInfo> {
  if (stops.length < 2) return { path: [], distanceKm: 0, durationMin: 0, estimated: false }
  const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';')
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal },
    )
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route) throw new Error('no route')
    return {
      path: (route.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      estimated: false,
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return straightLine(stops)
  }
}

export function formatDuration(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h} h ${m} min` : `${m} min`
}
