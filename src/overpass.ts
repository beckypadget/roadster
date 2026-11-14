/**
 * Shared Overpass API access. The public servers are often "at capacity" or
 * slow (12–45 s in testing), so we ask the main server and a mirror at the same
 * time and use whichever answers first (fine for a personal app's volume).
 * After both fail, skip Overpass for a few minutes so the app doesn't keep
 * making you wait for requests that will fail.
 */

// overpass-api.de is the main server; maps.mail.ru (VK) is a full-planet mirror
// that allows browser requests. Tested Nov 2026: private.coffee timed out and
// openstreetmap.fr blocks repeat requests, so neither is used.
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
const TIMEOUT_MS = 40000
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
  const race = new AbortController()
  const stop = AbortSignal.any([race.signal, AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : [])])
  try {
    const elements = await Promise.any(
      ENDPOINTS.map(async (url) => {
        const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: stop })
        if (!res.ok) throw new Error(`Overpass ${res.status}`)
        return (await res.json()).elements as OverpassElement[]
      }),
    )
    race.abort() // cancel the slower request
    return elements
  } catch (e) {
    if (signal?.aborted) throw e
    downUntil = Date.now() + COOL_OFF_MS
    throw e instanceof AggregateError ? new Error('Overpass unavailable') : e
  }
}
