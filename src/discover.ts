import { haversineKm } from './geo'

/**
 * Suggestions come from Wikipedia's location search. Only places notable enough
 * to have an article are returned, and each comes with a short description and
 * usually a photo. Results are sorted into categories from their description;
 * anything that doesn't match a category (villages, schools, stations…) is dropped.
 */

export type Category = 'castles' | 'history' | 'coast' | 'nature' | 'hikes' | 'scenic' | 'attractions'

export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'castles', label: 'Castles & houses', icon: '🏰' },
  { id: 'history', label: 'History', icon: '🏛' },
  { id: 'coast', label: 'Views & coast', icon: '🌊' },
  { id: 'nature', label: 'Nature', icon: '⛰' },
  { id: 'hikes', label: 'Hikes & walks', icon: '🥾' },
  { id: 'scenic', label: 'Scenic drives', icon: '🛣' },
  { id: 'attractions', label: 'Museums & attractions', icon: '🎟' },
]
export const categoryInfo = (c: Category) => CATEGORIES.find((x) => x.id === c)!

export interface Suggestion {
  /** Stable id: the Wikipedia title, or "osm:node/123" */
  id: string
  source: 'wikipedia' | 'osm'
  /** Where "More" / the info link goes */
  link: string
  /** Display name */
  title: string
  lat: number
  lng: number
  category: Category
  description: string
  thumbnail?: string
  /** No exact location to show (e.g. a long-distance trail passing through) */
  noMarker?: boolean
  /** km from the stop (stop mode) or from the route (leg mode) */
  distanceKm: number
  score: number
}

// Checked in order; first match wins. Exclusions are checked first.
const EXCLUDE = /\b(human settlement|village|town|city|hamlet|suburb|civil parish|community council|council area|railway station|bus station|school|college|university|hospital|football|rugby|cricket|club\b|stadium|sports venue|court|prison|radio|newspaper|company|business|shopping|retail|power station|substation|hydroelectric|military|airport|airfield|constituency|electoral|ward\b|parliament|council|police|fire station|judicial|courthouse|cemetery|graveyard|hotel|restaurant|pub\b|inn\b|band\b|album|song|film|novel|person|politician|footballer|church of scotland congregation|parish church)\b/i

const RULES: [Category, RegExp][] = [
  ['hikes', /\b(footpath|hiking trail|hiking route|walking route|walking trail|long[- ]distance (foot)?path|long[- ]distance trail|long[- ]distance route|nature trail|trail\b|walkway|hill ?walk)/i],
  ['scenic', /\b(mountain pass|scenic|tourist route|tourist drive|coastal route|pass\b|bealach)\b/i],
  ['castles', /\b(castle|palace|tower house|stately home|country house|manor|château|chateau|fortress|fortified house|mansion)\b/i],
  ['history', /\b(abbey|priory|cathedral|monastery|ruin|ruins|battle|battlefield|siege|monument|memorial|archaeological|standing stone|stone circle|broch|cairn|hillfort|hill fort|roman|neolithic|bronze age|iron age|pictish|viking|chapel|historic|heritage site|fort\b|crannog)\b/i],
  ['nature', /\b(mountain|hill|munro|corbett|glen|valley|loch|lake|waterfall|falls\b|forest|wood\b|woodland|nature reserve|national park|national nature reserve|gorge|cave|canyon|garden|gardens|arboretum|moor|ridge|summit|peak|volcano|marsh|wetland)\b/i],
  ['coast', /\b(beach|bay|cliff|lighthouse|island|isle|headland|cape|peninsula|sea stack|coast|coastline|harbour|sound\b|firth|viewpoint|cove|sands\b|machair)\b/i],
  ['attractions', /\b(museum|gallery|distillery|brewery|winery|zoo|aquarium|visitor centre|visitor center|tourist attraction|attraction|heritage railway|steam railway|theme park|canal|locks?\b|viaduct|bridge|observatory|exhibition)\b/i],
]

function classify(title: string, description: string, length: number): Category | null {
  if (EXCLUDE.test(description)) return null
  // The description decides; the title is only a fallback (titles like
  // "Fort William Sheriff Court" or "Isle of Raasay distillery" mislead)
  for (const [cat, re] of RULES) if (re.test(description)) return cat
  for (const [cat, re] of RULES) if (re.test(title)) return cat
  // Long articles about roads are usually notable drives (e.g. Bealach na Bà, A82)
  if (/\broad\b/i.test(description) && length > 6000) return 'scenic'
  return null
}

const CATEGORY_BOOST: Record<Category, number> = {
  castles: 0.6, history: 0.3, coast: 0.4, nature: 0.4, hikes: 0.5, scenic: 0.6, attractions: 0.3,
}

interface WikiPage {
  title: string
  description?: string
  length?: number
  thumbnail?: { source: string }
  coordinates?: { lat: number; lon: number }[]
}

const pageCache = new Map<string, WikiPage[]>()

/** One Wikipedia geosearch call: up to 50 articles within `radiusM` (max 10 km). */
async function geosearch(lat: number, lng: number, radiusM: number, signal?: AbortSignal): Promise<WikiPage[]> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radiusM}`
  const hit = pageCache.get(key)
  if (hit) return hit
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'geosearch',
    ggscoord: `${lat}|${lng}`,
    ggsradius: String(Math.min(10000, Math.round(radiusM))),
    ggslimit: '50',
    prop: 'coordinates|description|pageimages|info',
    colimit: 'max',
    piprop: 'thumbnail',
    pithumbsize: '240',
    pilimit: '50',
  })
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { signal })
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  const pages: WikiPage[] = (await res.json()).query?.pages ?? []
  pageCache.set(key, pages)
  return pages
}

/** Run tasks with limited concurrency (be polite to Wikipedia). */
async function pool<T>(tasks: (() => Promise<T>)[], size: number): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(tasks.length)
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++
      try {
        out[i] = { status: 'fulfilled', value: await tasks[i]() }
      } catch (e) {
        out[i] = { status: 'rejected', reason: e }
      }
    }
  }
  await Promise.all(Array.from({ length: size }, worker))
  return out
}

/** Offset a point by km north/east (good enough at these scales). */
function offset(lat: number, lng: number, northKm: number, eastKm: number) {
  return { lat: lat + northKm / 111, lng: lng + eastKm / (111 * Math.cos((lat * Math.PI) / 180)) }
}

function toSuggestions(
  pages: WikiPage[],
  distanceOf: (p: { lat: number; lng: number }) => number,
  maxKm: number,
  keep: (p: { lat: number; lng: number }) => boolean = () => true,
) {
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const p of pages) {
    if (seen.has(p.title)) continue
    seen.add(p.title)
    const c = p.coordinates?.[0]
    if (!c) continue
    const category = classify(p.title, p.description ?? '', p.length ?? 0)
    if (!category) continue
    const pt = { lat: c.lat, lng: c.lon }
    const distanceKm = distanceOf(pt)
    if (distanceKm > maxKm || !keep(pt)) continue
    const score =
      Math.log10(Math.max(500, p.length ?? 500)) + // longer article ≈ more notable
      (p.thumbnail ? 0.4 : 0) +
      CATEGORY_BOOST[category] -
      0.6 * Math.log10(1 + distanceKm)
    out.push({
      id: p.title,
      source: 'wikipedia',
      link: wikipediaUrl(p.title),
      title: p.title,
      ...pt,
      category,
      description: p.description ?? '',
      thumbnail: p.thumbnail?.source,
      distanceKm,
      score,
    })
  }
  // Several articles often share one spot (a castle and a battle fought at it):
  // keep the strongest within 300 m
  const ranked = out.sort((a, b) => b.score - a.score)
  const kept: Suggestion[] = []
  for (const s of ranked) if (!kept.some((k) => haversineKm(k, s) < 0.3)) kept.push(s)
  return kept
}

/** Suggestions within ~25 km of a stop: one search at the centre plus a ring of six. */
export async function suggestNear(stop: { lat: number; lng: number }, signal?: AbortSignal): Promise<Suggestion[]> {
  const points = [stop, ...[0, 60, 120, 180, 240, 300].map((deg) => {
    const r = (deg * Math.PI) / 180
    return offset(stop.lat, stop.lng, 15 * Math.cos(r), 15 * Math.sin(r))
  })]
  const results = await pool(points.map((p) => () => geosearch(p.lat, p.lng, 10000, signal)), 3)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const pages = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (!pages.length && results.every((r) => r.status === 'rejected')) throw new Error('Search failed')
  return toSuggestions(pages, (p) => haversineKm(stop, p), 26)
}

/** Pick points along a path roughly every `spacingKm`. */
function samplePath(path: [number, number][], spacingKm: number) {
  const out: { lat: number; lng: number }[] = []
  let acc = Infinity
  for (let i = 0; i < path.length; i++) {
    const p = { lat: path[i][0], lng: path[i][1] }
    if (i > 0) acc += haversineKm({ lat: path[i - 1][0], lng: path[i - 1][1] }, p)
    if (acc >= spacingKm) {
      out.push(p)
      acc = 0
    }
  }
  return out
}

/** Suggestions within ~8 km of the road along a leg (searches every ~12 km, capped at 25 searches). */
export async function suggestAlong(path: [number, number][], signal?: AbortSignal): Promise<Suggestion[]> {
  if (path.length < 2) return []
  let lengthKm = 0
  for (let i = 1; i < path.length; i++)
    lengthKm += haversineKm({ lat: path[i - 1][0], lng: path[i - 1][1] }, { lat: path[i][0], lng: path[i][1] })
  const spacing = Math.max(12, lengthKm / 25)
  const points = samplePath(path, spacing)
  const results = await pool(points.map((p) => () => geosearch(p.lat, p.lng, 10000, signal)), 3)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const pages = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (!pages.length && results.every((r) => r.status === 'rejected')) throw new Error('Search failed')
  // Distance off route: nearest path vertex (path points are dense, so this is close enough)
  const step = Math.max(1, Math.floor(path.length / 800))
  const verts = path.filter((_, i) => i % step === 0).map(([lat, lng]) => ({ lat, lng }))
  const offRoute = (p: { lat: number; lng: number }) => Math.min(...verts.map((v) => haversineKm(v, p)))
  // Places right at either end belong to that stop's "nearby" list instead
  const start = { lat: path[0][0], lng: path[0][1] }
  const end = { lat: path[path.length - 1][0], lng: path[path.length - 1][1] }
  const notAtEnds = (p: { lat: number; lng: number }) => haversineKm(p, start) > 3 && haversineKm(p, end) > 3
  return toSuggestions(pages, offRoute, 8, notAtEnds)
}

/** First couple of sentences of the article, fetched when a card is expanded. */
const extractCache = new Map<string, string>()
export async function fetchExtract(title: string): Promise<string> {
  const hit = extractCache.get(title)
  if (hit) return hit
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  const text: string = (await res.json()).extract ?? ''
  extractCache.set(title, text)
  return text
}

/** Interleave categories so an "All" list isn't dominated by one kind (e.g. mountains). */
export function mixCategories(list: Suggestion[]): Suggestion[] {
  const byCat = new Map<Category, Suggestion[]>()
  for (const s of list) byCat.set(s.category, [...(byCat.get(s.category) ?? []), s])
  const queues = [...byCat.values()]
  const out: Suggestion[] = []
  while (queues.some((q) => q.length)) {
    // each round, take the best remaining item from each category, best first
    const round = queues.filter((q) => q.length).map((q) => q.shift()!).sort((a, b) => b.score - a.score)
    out.push(...round)
  }
  return out
}

export const wikipediaUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
