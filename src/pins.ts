import type { Stop } from './types'

export type PinMode = 'nights' | 'stops'

/** First night at each stop (1-based), or null for stops with no nights. */
export function nightNumbers(stops: Stop[]) {
  let night = 1
  return stops.map((s) => {
    if (s.nights <= 0) return null
    const first = night
    night += s.nights
    return first
  })
}

/** What each stop's badge shows: a number, or null for a dot (no nights, in nights mode). */
export function pinLabels(stops: Stop[], mode: PinMode): (string | null)[] {
  if (mode === 'stops') return stops.map((_, i) => String(i + 1))
  return nightNumbers(stops).map((n) => (n == null ? null : String(n)))
}

const KEY = 'roadster.pins'
export const loadPinMode = (): PinMode => {
  try {
    return localStorage.getItem(KEY) === 'stops' ? 'stops' : 'nights'
  } catch {
    return 'nights'
  }
}
export const savePinMode = (m: PinMode) => {
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* ignore */
  }
}
