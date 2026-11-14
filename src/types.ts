export interface Stop {
  id: string
  name: string
  lat: number
  lng: number
  nights: number
  notes: string
}

export interface Trip {
  id: string
  name: string
  startDate: string // yyyy-mm-dd, may be empty
  stops: Stop[]
  createdAt: number
}

export interface RouteInfo {
  /** [lat, lng] points along the route */
  path: [number, number][]
  distanceKm: number
  durationMin: number | null
  /** true when real road routing was unavailable and we drew straight lines */
  estimated: boolean
}
