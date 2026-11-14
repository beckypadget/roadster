/** How to drive a leg: Valhalla's use_highways 0 / 0.5 / 1 */
export type RoadPref = 'avoid' | 'standard' | 'prefer'

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
}

export interface RouteInfo {
  /** legs[i] is the drive from stops[i] to stops[i + 1] */
  legs: LegInfo[]
  distanceKm: number
  durationMin: number | null
  estimated: boolean
}
