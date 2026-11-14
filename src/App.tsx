import { useEffect, useState } from 'react'
import { TripList } from './components/TripList'
import { TripMap } from './components/TripMap'
import { TripView } from './components/TripView'
import { getRoute } from './geo'
import { useTrips } from './storage'
import type { RouteInfo } from './types'

const defaultUnits = (): 'km' | 'mi' => {
  try {
    const saved = localStorage.getItem('roadster.units')
    if (saved === 'km' || saved === 'mi') return saved
  } catch { /* ignore */ }
  return /^en-(US|GB)|^my/.test(navigator.language) ? 'mi' : 'km'
}

export default function App() {
  const { trips, addTrip, updateTrip, deleteTrip } = useTrips()
  const [openId, setOpenId] = useState<string | null>(null)
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [units, setUnits] = useState(defaultUnits)

  const trip = trips.find((t) => t.id === openId) ?? null
  // Only re-route when the stop positions/order change, not on note edits
  const routeKey = trip?.stops.map((s) => `${s.lat},${s.lng}`).join('|') ?? ''

  useEffect(() => {
    if (!trip || trip.stops.length < 2) {
      setRoute(null)
      return
    }
    const ctrl = new AbortController()
    setRouteLoading(true)
    getRoute(trip.stops, ctrl.signal)
      .then(setRoute)
      .catch(() => {})
      .finally(() => !ctrl.signal.aborted && setRouteLoading(false))
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  useEffect(() => {
    try { localStorage.setItem('roadster.units', units) } catch { /* ignore */ }
  }, [units])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span>Roadster</span>
        </div>
        <button className="btn ghost small" onClick={() => setUnits(units === 'km' ? 'mi' : 'km')} aria-label="Toggle units">
          {units === 'km' ? 'km' : 'miles'}
        </button>
      </header>
      <main className="layout">
        <section className="sidebar">
          {trip ? (
            <TripView
              trip={trip}
              route={route}
              routeLoading={routeLoading}
              units={units}
              onChange={updateTrip}
              onDelete={() => { deleteTrip(trip.id); setOpenId(null) }}
              onBack={() => setOpenId(null)}
            />
          ) : (
            <TripList trips={trips} onOpen={setOpenId} onCreate={(name) => setOpenId(addTrip(name).id)} />
          )}
        </section>
        <section className="map-wrap">
          <TripMap stops={trip?.stops ?? []} route={route} />
        </section>
      </main>
    </div>
  )
}
