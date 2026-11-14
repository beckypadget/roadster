import type { Category } from './discover'

/** How to drive a leg: Valhalla's use_highways 0 / 0.5 / 1 */
export type RoadPref = 'avoid' | 'standard' | 'prefer'

/** A place you want to visit, saved against a stop */
export interface Plan {
  id: string
  title: string
  lat: number
  lng: number
  category: Category
  description: string
  thumbnail?: string
  /** Suggestion id it came from (Wikipedia title or "osm:node/123") */
  sourceId?: string
  /** Info link (Wikipedia or OpenStreetMap) */
  link?: string
  /** No exact location (e.g. a long-distance trail): not shown on the map */
  noMarker?: boolean
  /** Saved from "along the way" on the drive to this stop, rather than near it */
  onTheWay?: boolean
  done?: boolean
}

export interface Stop {
  id: string
  name: string
  lat: number
  lng: number
  nights: number
  notes: string
  /** Motorway preference for the drive *to* this stop. Missing means 'standard'. */
  arriveVia?: RoadPref
  /** Avoid ferries on the drive to this stop (used anyway if there's no other way) */
  avoidFerries?: boolean
  /** Avoid roads already driven on earlier legs (no out-and-back) */
  avoidRetrace?: boolean
  /** Chosen route for the drive here: 0 = suggested, 1+ = alternatives */
  routeChoice?: number
  /** Things to see and do at or on the way to this stop */
  plans?: Plan[]
}

export interface Trip {
  id: string
  name: string
  startDate: string // yyyy-mm-dd, may be empty
  stops: Stop[]
  createdAt: number
}

export interface LegInfo {
  /** [lat, lng] points along the leg */
  path: [number, number][]
  distanceKm: number
  durationMin: number | null
  /** true when road routing was unavailable and we drew a straight line */
  estimated: boolean
  /** false when the backup router was used and the motorway setting couldn't be applied */
  prefApplied: boolean
  /** Whether the route uses a ferry (unknown when the backup router was used) */
  hasFerry?: boolean
  /** km of this leg that repeats roads from earlier legs */
  retraceKm: number
  /** Set when "avoid retracing" is on: whether a different road was found */
  retraceAvoided?: 'yes' | 'no-alternative'
  /** Distance/time of the normal route, to show what avoiding retracing costs */
  normalDistanceKm?: number
  normalDurationMin?: number | null
  /** Set when an alternative was chosen but isn't available any more */
  choiceMissing?: boolean
}

export interface RouteInfo {
  /** legs[i] is the drive from stops[i] to stops[i + 1] */
  legs: LegInfo[]
  distanceKm: number
  durationMin: number | null
  estimated: boolean
}
