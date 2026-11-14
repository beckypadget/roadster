import type { PlaceResult } from '../search'
import { formatDuration } from '../geo'
import {
  DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useState } from 'react'
import type { Suggestion } from '../discover'
import type { Plan, RoadPref, RouteInfo, Stop, Trip } from '../types'
import { Discover } from './Discover'
import { PlanList } from './PlanList'
import { LegRow } from './LegRow'
import { GripIcon, StopCard } from './StopCard'
import { StopSearch } from './StopSearch'

interface Props {
  trip: Trip
  route: RouteInfo | null
  routeLoading: boolean
  units: 'km' | 'mi'
  onChange: (t: Trip) => void
  onDelete: () => void
  onBack: () => void
  onSuggestions: (list: Suggestion[]) => void
  onFocus: (p: { lat: number; lng: number; title: string } | null) => void
}

/** Drop where the pointer/finger is; fall back to nearest card (e.g. keyboard dragging). */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length ? hits : closestCenter(args)
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function TripView({ trip, route, routeLoading, units, onChange, onDelete, onBack, onSuggestions, onFocus }: Props) {
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

  // Drag to reorder. Each leg row belongs to the stop it drives to, so it
  // moves with that stop and nothing shifts when a drag starts.
  const [dragId, setDragId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = trip.stops.findIndex((s) => s.id === active.id)
    const to = trip.stops.findIndex((s) => s.id === over.id)
    setStops(arrayMove(trip.stops, from, to))
  }
  const dragging = dragId ? trip.stops.find((s) => s.id === dragId) : null
  const dragIndex = dragging ? trip.stops.indexOf(dragging) : -1

  const addStop = (p: PlaceResult) =>
    setStops([...trip.stops, { id: crypto.randomUUID(), name: p.name, lat: p.lat, lng: p.lng, nights: 0, notes: '' }])

  // Discover: one panel open at a time, either near a stop or along the leg to it
  const [discover, setDiscover] = useState<{ mode: 'stop' | 'leg'; stopId: string } | null>(null)
  const toggleDiscover = (mode: 'stop' | 'leg', stopId: string) =>
    setDiscover((d) => (d?.mode === mode && d.stopId === stopId ? null : { mode, stopId }))
  const savedTitles = new Set([...trip.stops.map((s) => s.name), ...trip.stops.flatMap((s) => (s.plans ?? []).map((p) => p.title))])

  const addPlan = (stopId: string, s: Suggestion, onTheWay: boolean) => {
    const plan: Plan = {
      id: crypto.randomUUID(), title: s.title, lat: s.lat, lng: s.lng, category: s.category,
      description: s.description, thumbnail: s.thumbnail, onTheWay,
    }
    setStops(trip.stops.map((x) => (x.id === stopId ? { ...x, plans: [...(x.plans ?? []), plan] } : x)))
  }
  const updatePlans = (stopId: string, fn: (plans: Plan[]) => Plan[]) =>
    setStops(trip.stops.map((x) => (x.id === stopId ? { ...x, plans: fn(x.plans ?? []) } : x)))
  /** Insert a suggestion as a new stop at `index` */
  const addSuggestionAsStop = (s: Suggestion, index: number) => {
    const stop: Stop = { id: crypto.randomUUID(), name: s.title, lat: s.lat, lng: s.lng, nights: 0, notes: s.description }
    const next = [...trip.stops]
    next.splice(index, 0, stop)
    setStops(next)
    setDiscover(null)
  }

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

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragId(null)}
      >
        <SortableContext items={trip.stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ol className={`stops${dragId ? ' is-dragging' : ''}`}>
            {trip.stops.map((s, i) => (
              <StopCard
                key={s.id}
                stop={s}
                index={i}
                count={trip.stops.length}
                arrival={trip.startDate ? addDays(trip.startDate, arrivals[i]) : null}
                leg={
                  i > 0 ? (
                    <LegRow
                      leg={route?.legs[i - 1]}
                      pref={s.arriveVia ?? 'standard'}
                      avoidFerries={!!s.avoidFerries}
                      loading={routeLoading && !route?.legs[i - 1]}
                      units={units}
                      toName={s.name}
                      onChange={(p: RoadPref) => updateStop(s.id, { arriveVia: p })}
                      onAvoidFerriesChange={(v) => updateStop(s.id, { avoidFerries: v })}
                      discoverOpen={discover?.mode === 'leg' && discover.stopId === s.id}
                      onToggleDiscover={() => toggleDiscover('leg', s.id)}
                      discover={
                        <Discover
                          mode="leg"
                          path={route?.legs[i - 1]?.path}
                          placeName={s.name}
                          units={units}
                          savedTitles={savedTitles}
                          onAddPlan={(sg) => addPlan(s.id, sg, true)}
                          onAddStop={(sg) => addSuggestionAsStop(sg, i)}
                          onResults={onSuggestions}
                          onFocus={(sg) => onFocus({ lat: sg.lat, lng: sg.lng, title: sg.title })}
                          onClose={() => setDiscover(null)}
                        />
                      }
                    />
                  ) : undefined
                }
                plans={
                  s.plans?.length ? (
                    <PlanList
                      plans={s.plans}
                      onToggleDone={(id) => updatePlans(s.id, (ps) => ps.map((p) => (p.id === id ? { ...p, done: !p.done } : p)))}
                      onRemove={(id) => updatePlans(s.id, (ps) => ps.filter((p) => p.id !== id))}
                      onFocus={(p) => onFocus({ lat: p.lat, lng: p.lng, title: p.title })}
                    />
                  ) : undefined
                }
                discoverOpen={discover?.mode === 'stop' && discover.stopId === s.id}
                onToggleDiscover={() => toggleDiscover('stop', s.id)}
                discover={
                  <Discover
                    mode="stop"
                    center={s}
                    placeName={s.name}
                    units={units}
                    savedTitles={savedTitles}
                    onAddPlan={(sg) => addPlan(s.id, sg, false)}
                    onAddStop={(sg) => addSuggestionAsStop(sg, i + 1)}
                    onResults={onSuggestions}
                    onFocus={(sg) => onFocus({ lat: sg.lat, lng: sg.lng, title: sg.title })}
                    onClose={() => setDiscover(null)}
                  />
                }
                onUpdate={(patch) => updateStop(s.id, patch)}
                onMove={(dir) => move(i, dir)}
                onRemove={() => setStops(trip.stops.filter((x) => x.id !== s.id))}
              />
            ))}
          </ol>
        </SortableContext>
        <DragOverlay>
          {dragging && (
            <div className="stop drag-overlay">
              <span className="grip"><GripIcon /></span>
              <div className="stop-num">{dragIndex + 1}</div>
              <strong>{dragging.name}</strong>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {trip.stops.length === 0 && <p className="hint">Search for your starting point to begin.</p>}
    </div>
  )
}
