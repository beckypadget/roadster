/**
 * Shared Overpass API access. The public servers are often "at capacity", so:
 * try the main server then a mirror, each with a time limit, and after both
 * fail, skip Overpass entirely for a few minutes so the app doesn't keep
 * making people wait for requests that will fail.
 */

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const TIMEOUT_MS = 12000
const COOL_OFF_MS = 3 * 60 * 1000
let downUntil = 0

export interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export const overpassLikelyDown = () => Date.now() < downUntil

export async function overpass(query: string, signal?: AbortSignal): Promise<OverpassElement[]> {
  if (overpassLikelyDown()) throw new Error('Overpass busy (cooling off)')
  let last: unknown
  for (const url of ENDPOINTS) {
    try {
      const t = AbortSignal.timeout(TIMEOUT_MS)
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: signal ? AbortSignal.any([signal, t]) : t,
      })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      return (await res.json()).elements as OverpassElement[]
    } catch (e) {
      if (signal?.aborted) throw e
      last = e
    }
  }
  downUntil = Date.now() + COOL_OFF_MS
  throw last ?? new Error('Overpass unavailable')
}
