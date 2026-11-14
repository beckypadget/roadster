import type { PlaceResult } from '../search'
import { formatDuration } from '../geo'
import { Fragment } from 'react'
import type { RoadPref, RouteInfo, Stop, Trip } from '../types'
import { LegRow } from './LegRow'
import { StopSearch } from './StopSearch'

interface Props {
  trip: Trip
  route: RouteInfo | null
  routeLoading: boolean
  units: 'km' | 'mi'
  onChange: (t: Trip) => void
  onDelete: () => void
  onBack: () => void
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function TripView({ trip, route, routeLoading, units, onChange, onDelete, onBack }: Props) {
  const setStops = (stops: Stop[]) => onChange({ ...trip, stops })
  const updateStop = (id: string, patch: Partial<Stop>) =>
    setStops(trip.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= trip.stops.length) return
    const next = [...trip.stops]
    ;[next[i], next[j]] = [next[j], next[i]]
    setStops(next)
  }

  const addStop = (p: PlaceResult) =>
    setStops([...trip.stops, { id: crypto.randomUUID(), name: p.name, lat: p.lat, lng: p.lng, nights: 0, notes: '' }])

  const totalNights = trip.stops.reduce((n, s) => n + s.nights, 0)
  const dist = route ? (units === 'mi' ? route.distanceKm * 0.621371 : route.distanceKm) : 0

  // Day offset at which you arrive at each stop
  const arrivals = trip.stops.map((_, i) =>
    trip.stops.slice(0, i).reduce((n, s) => n + s.nights, 0),
  )

  return (
    <div className="panel">
      <div className="row between">
        <button className="btn ghost" onClick={onBack}>← All trips</button>
        <button
          className="btn ghost danger"
          onClick={() => confirm(`Delete "${trip.name}"? This can't be undone.`) && onDelete()}
        >
          Delete
        </button>
      </div>

      <input className="title-input" value={trip.name} onChange={(e) => onChange({ ...trip, name: e.target.value })} aria-label="Trip name" />

      <label className="field">
        Start date
        <input type="date" value={trip.startDate} onChange={(e) => onChange({ ...trip, startDate: e.target.value })} />
      </label>

      {trip.stops.length > 1 && (
        <div className="summary">
          {routeLoading ? (
            <span>Calculating route…</span>
          ) : route ? (
            <>
              <span><strong>{Math.round(dist).toLocaleString()}</strong> {units}{route.estimated && ' (straight line)'}</span>
              {route.durationMin != null && <span><strong>{formatDuration(route.durationMin)}</strong> driving</span>}
              <span><strong>{totalNights}</strong> night{totalNights === 1 ? '' : 's'}</span>
            </>
          ) : null}
        </div>
      )}

      <StopSearch stops={trip.stops} units={units} onAdd={addStop} />

      <ol className="stops">
        {trip.stops.map((s, i) => (
          <Fragment key={s.id}>
          {i > 0 && (
            <LegRow
              leg={route?.legs[i - 1]}
              pref={s.arriveVia ?? 'standard'}
              loading={routeLoading && !route?.legs[i - 1]}
              units={units}
              toName={s.name}
              onChange={(p: RoadPref) => updateStop(s.id, { arriveVia: p })}
            />
          )}
          <li className="stop">
            <div className="stop-num">{i + 1}</div>
            <div className="stop-body">
              <div className="row between">
                <strong>{s.name}</strong>
                <div className="stop-actions">
                  <button className="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="icon" aria-label="Move down" disabled={i === trip.stops.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="icon" aria-label="Remove stop" onClick={() => setStops(trip.stops.filter((x) => x.id !== s.id))}>✕</button>
                </div>
              </div>
              {trip.startDate && <div className="hint">Arrive {addDays(trip.startDate, arrivals[i])}</div>}
              <div className="row">
                <label className="field inline">
                  Nights
                  <input
                    type="number"
                    min={0}
                    value={s.nights}
                    onChange={(e) => updateStop(s.id, { nights: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </label>
              </div>
              <textarea
                placeholder="Notes: where to stay, what to see…"
                value={s.notes}
                rows={s.notes ? 2 : 1}
                onChange={(e) => updateStop(s.id, { notes: e.target.value })}
              />
            </div>
          </li>
          </Fragment>
        ))}
      </ol>
      {trip.stops.length === 0 && <p className="hint">Search for your starting point to begin.</p>}
    </div>
  )
}
