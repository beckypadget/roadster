import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { categoryInfo, type Suggestion } from '../discover'
import type { Plan, RouteInfo, Stop } from '../types'
import { CarParkLayer, VanLayer, type AddPlace, type LayerStatus } from './MapLayers'

type Pt = { lat: number; lng: number }

function numberedIcon(n: number, last: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="pin${last ? ' pin-end' : ''}">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

const placeIcon = (emoji: string, kind: 'suggestion' | 'plan', focused: boolean) =>
  L.divIcon({
    className: '',
    html: `<div class="poi poi-${kind}${focused ? ' poi-focus' : ''}">${emoji}</div>`,
    iconSize: focused ? [34, 34] : [26, 26],
    iconAnchor: focused ? [17, 17] : [13, 13],
  })

/** Fit the map to the trip, only when stop positions change (not on every edit). */
function FitStops({ stops, active }: { stops: Stop[]; active: boolean }) {
  const map = useMap()
  const key = stops.map((s) => `${s.lat},${s.lng}`).join('|')
  useEffect(() => {
    if (!active) return
    if (stops.length === 1) map.setView([stops[0].lat, stops[0].lng], 10)
    else if (stops.length > 1) map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng])), { padding: [40, 40] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, active])
  return null
}

/**
 * When a Discover panel first fills, fit the map to its suggestions. Later
 * updates (trails or viewpoints arriving, filters, "show more") don't move the
 * map, so they never undo the user's own panning and zooming.
 */
function FitSuggestions({ points }: { points: Pt[] }) {
  const map = useMap()
  const shown = useRef(false)
  useEffect(() => {
    if (!points.length) {
      shown.current = false
      return
    }
    if (shown.current) return
    shown.current = true
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 12 })
  }, [map, points])
  return null
}

function FlyTo({ focus }: { focus: (Pt & { title: string }) | null }) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 12), { duration: 0.6 })
  }, [map, focus])
  return null
}

interface Props {
  stops: Stop[]
  route: RouteInfo | null
  suggestions: Suggestion[]
  focus: (Pt & { title: string }) | null
  onAddStop: (p: AddPlace) => void
}

type Layers = { parking: boolean; van: boolean }
const LAYERS_KEY = 'roadster.layers'
const loadLayers = (): Layers => {
  try {
    return { parking: false, van: false, ...JSON.parse(localStorage.getItem(LAYERS_KEY) || '{}') }
  } catch {
    return { parking: false, van: false }
  }
}

export function TripMap({ stops, route, suggestions, focus, onAddStop }: Props) {
  const [layers, setLayers] = useState<Layers>(loadLayers)
  const [parkStatus, setParkStatus] = useState<LayerStatus>(null)
  const [vanStatus, setVanStatus] = useState<LayerStatus>(null)
  useEffect(() => {
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(layers)) } catch { /* ignore */ }
  }, [layers])
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }))
  const statuses = [layers.parking && parkStatus, layers.van && vanStatus].filter(Boolean) as NonNullable<LayerStatus>[]

  const plans: Plan[] = stops.flatMap((s) => s.plans ?? []).filter((p) => !p.noMarker)
  const mappable = suggestions.filter((s) => !s.noMarker)
  const suggestionsShown = mappable.filter((s) => !plans.some((p) => (p.sourceId ?? p.title) === s.id))

  return (
    <div className="map-shell">
    <div className="layer-controls" role="group" aria-label="Map layers">
      <button type="button" className={`layer-btn${layers.parking ? ' on' : ''}`} aria-pressed={layers.parking} onClick={() => toggle('parking')}>
        <span className="lyr lyr-parking" aria-hidden="true">P</span> Car parks
      </button>
      <button type="button" className={`layer-btn${layers.van ? ' on' : ''}`} aria-pressed={layers.van} onClick={() => toggle('van')}>
        <span aria-hidden="true">🚐</span> Overnight
      </button>
      {statuses.map((s, i) => (
        <div key={i} className={`layer-status ${s.tone}`} role="status">{s.text}</div>
      ))}
    </div>
    <MapContainer center={[39.5, -98.35]} zoom={4} className="map" zoomControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {route?.legs.map((leg, i) => (
        <Polyline
          key={`${i}-${leg.path.length}-${leg.distanceKm}`}
          positions={leg.path}
          className="route-line"
          pathOptions={{ weight: 5, opacity: 0.9, dashArray: leg.estimated ? '8 8' : undefined }}
        />
      ))}
      {plans.map((p) => (
        <Marker key={`plan-${p.id}`} position={[p.lat, p.lng]} icon={placeIcon(categoryInfo(p.category).icon, 'plan', focus?.title === p.title)}>
          <Popup><strong>{p.title}</strong><div>{p.description}</div></Popup>
        </Marker>
      ))}
      {suggestionsShown.map((s) => (
        <Marker key={`sugg-${s.id}`} position={[s.lat, s.lng]} icon={placeIcon(categoryInfo(s.category).icon, 'suggestion', focus?.title === s.title)}>
          <Popup><strong>{s.title}</strong><div>{s.description}</div></Popup>
        </Marker>
      ))}
      {stops.map((s, i) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={numberedIcon(i + 1, i === stops.length - 1 && i > 0)} zIndexOffset={1000}>
          <Popup>
            <strong>{s.name}</strong>
            {s.nights > 0 && <div>{s.nights} night{s.nights > 1 ? 's' : ''}</div>}
          </Popup>
        </Marker>
      ))}
      {layers.parking && <CarParkLayer onStatus={setParkStatus} onAddStop={onAddStop} />}
      {layers.van && <VanLayer onStatus={setVanStatus} onAddStop={onAddStop} />}
      <FitStops stops={stops} active={mappable.length === 0} />
      <FitSuggestions points={mappable} />
      <FlyTo focus={focus} />
    </MapContainer>
    </div>
  )
}
