import { useEffect, useState } from 'react'
import { Home } from './components/Home'
import { TripMap } from './components/TripMap'
import { TripView } from './components/TripView'
import { getRoute } from './geo'
import { samplePacificCoastStops } from './sampleTrip'
import { useTrips } from './storage'
import type { RouteInfo } from './types'
import { useHashRoute } from './useHashRoute'

const defaultUnits = (): 'km' | 'mi' => {
  try {
    const saved = localStorage.getItem('roadster.units')
    if (saved === 'km' || saved === 'mi') return saved
  } catch { /* ignore */ }
  return /^en-(US|GB)|^my/.test(navigator.language) ? 'mi' : 'km'
}

export default function App() {
  const { trips, addTrip, updateTrip, deleteTrip } = useTrips()
  const { route: page, go } = useHashRoute()
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [units, setUnits] = useState(defaultUnits)

  const trip = page.page === 'trip' ? (trips.find((t) => t.id === page.id) ?? null) : null
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

  const openTrip = (id: string) => go({ page: 'trip', id })

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span>Roadster</span>
        </a>
        <button className="btn ghost small" onClick={() => setUnits(units === 'km' ? 'mi' : 'km')} aria-label="Toggle units">
          {units === 'km' ? 'km' : 'miles'}
        </button>
      </header>
      {trip ? (
        <main className="layout">
          <section className="sidebar">
            <TripView
              trip={trip}
              route={route}
              routeLoading={routeLoading}
              units={units}
              onChange={updateTrip}
              onDelete={() => { deleteTrip(trip.id); go({ page: 'home' }) }}
              onBack={() => go({ page: 'home' })}
            />
          </section>
          <section className="map-wrap">
            <TripMap stops={trip.stops} route={route} />
          </section>
        </main>
      ) : (
        <main className="home-wrap">
          <Home
            trips={trips}
            onOpen={openTrip}
            onCreate={(name) => openTrip(addTrip(name).id)}
            onCreateSample={() => openTrip(addTrip('Pacific Coast Highway (sample)', samplePacificCoastStops()).id)}
          />
        </main>
      )}
    </div>
  )
}
