import type { Stop } from './types'

const stop = (name: string, lat: number, lng: number, nights: number, notes = ''): Stop => ({
  id: crypto.randomUUID(), name, lat, lng, nights, notes,
})

/** A ready-made trip so new users can see what a planned trip looks like. */
export function samplePacificCoastStops(): Stop[] {
  return [
    stop('San Francisco', 37.7749, -122.4194, 0, 'Start early to beat traffic on the Golden Gate.'),
    stop('Monterey', 36.6002, -121.8947, 1, 'Aquarium and Cannery Row.'),
    stop('Big Sur', 36.2704, -121.8081, 1, 'Bixby Bridge, McWay Falls. Little phone signal: download maps.'),
    stop('San Luis Obispo', 35.2828, -120.6596, 1),
    stop('Santa Barbara', 34.4208, -119.6982, 1, 'Stearns Wharf at sunset.'),
    stop('Los Angeles', 34.0522, -118.2437, 0),
  ]
}
