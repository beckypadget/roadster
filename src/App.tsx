import { useEffect, useState } from 'react'
import { Home } from './components/Home'
import { TripMap } from './components/TripMap'
import { DEFAULT_NIGHTS, TripView } from './components/TripView'
import { haversineKm } from './geo'
import { getRoute, routeIsCached } from './routing'
import { samplePacificCoastStops } from './sampleTrip'
import { useTrips } from './storage'
import type { Suggestion } from './discover'
import { loadPinMode, savePinMode, type PinMode } from './pins'
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
  // Suggestions currently shown in a Discover panel, and the place to centre the map on
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [focus, setFocus] = useState<{ lat: number; lng: number; title: string } | null>(null)
  // Alternative routes being compared for one leg, drawn faintly on the map
  const [previewRoutes, setPreviewRoutes] = useState<[number, number][][]>([])
  // What the numbers on stop pins/badges mean: night number or stop order
  const [pinMode, setPinMode] = useState<PinMode>(loadPinMode)
  const changePinMode = (m: PinMode) => {
    setPinMode(m)
    savePinMode(m)
  }

  const trip = page.page === 'trip' ? (trips.find((t) => t.id === page.id) ?? null) : null
  // Only re-route when stop positions/order or motorway settings change, not on note edits
  const routeKey = trip?.stops.map((s) => `${s.lat},${s.lng},${s.arriveVia ?? ''},${s.avoidFerries ? 1 : 0},${s.avoidRetrace ? 1 : 0},${s.routeChoice ?? 0}`).join('|') ?? ''

  useEffect(() => {
    if (!trip || trip.stops.length < 2) {
      setRoute(null)
      return
    }
    const ctrl = new AbortController()
    setRouteLoading(!routeIsCached(trip.stops))
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
              onSuggestions={setSuggestions}
              onFocus={setFocus}
              onPreviewRoutes={setPreviewRoutes}
              pinMode={pinMode}
            />
          </section>
          <section className="map-wrap">
            <TripMap
              stops={trip.stops}
              route={route}
              suggestions={suggestions}
              focus={focus}
              previewRoutes={previewRoutes}
              pinMode={pinMode}
              onPinModeChange={changePinMode}
              units={units}
              onAddStop={(p) => {
                // Insert after the nearest existing stop (drag to adjust)
                const stops = trip.stops
                let at = stops.length
                if (stops.length) {
                  const nearest = stops.reduce((best, s, i) => (haversineKm(s, p) < haversineKm(stops[best], p) ? i : best), 0)
                  at = nearest + 1
                }
                const next = [...stops]
                next.splice(at, 0, { id: crypto.randomUUID(), name: p.name, lat: p.lat, lng: p.lng, nights: p.nights ?? DEFAULT_NIGHTS, notes: p.notes ?? '' })
                updateTrip({ ...trip, stops: next })
              }}
            />
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
