import { useEffect, useState } from 'react'
import type { Trip } from './types'

const KEY = 'roadster.trips.v1'

function load(): Trip[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Trip[]) : []
  } catch {
    return []
  }
}

/** Trips are stored on this device only (localStorage). */
export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(trips))
    } catch {
      /* storage full or unavailable */
    }
  }, [trips])

  const updateTrip = (trip: Trip) =>
    setTrips((ts) => ts.map((t) => (t.id === trip.id ? trip : t)))

  const addTrip = (name: string): Trip => {
    const trip: Trip = { id: crypto.randomUUID(), name, startDate: '', stops: [], createdAt: Date.now() }
    setTrips((ts) => [trip, ...ts])
    return trip
  }

  const deleteTrip = (id: string) => setTrips((ts) => ts.filter((t) => t.id !== id))

  return { trips, addTrip, updateTrip, deleteTrip }
}
