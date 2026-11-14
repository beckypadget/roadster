import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import {
  CAR_PARK_MIN_ZOOM, VAN_LABELS, VAN_MIN_ZOOM, VAN_SHORT, carParksIn, directionsUrl, vanSpotsBasic, vanSpotsDetailed,
  type Bounds, type CarPark, type VanSpot,
} from '../mapLayers'

export type LayerStatus = { text: string; tone: 'info' | 'warn' } | null

export interface AddPlace {
  name: string
  lat: number
  lng: number
  notes?: string
  /** Nights to plan here; defaults to 1 (car parks use 0) */
  nights?: number
}

const carParkIcon = L.divIcon({ className: '', html: '<div class="lyr lyr-parking">P</div>', iconSize: [20, 20], iconAnchor: [10, 10] })
const vanIcons = {
  motorhome_site: L.divIcon({ className: '', html: '<div class="lyr lyr-van lyr-van-good">🚐</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
  campsite_vans: L.divIcon({ className: '', html: '<div class="lyr lyr-van lyr-van-good">⛺</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
  campsite: L.divIcon({ className: '', html: '<div class="lyr lyr-van">⛺</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
  parking: L.divIcon({ className: '', html: '<div class="lyr lyr-van lyr-van-good">🅿</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
  services: L.divIcon({ className: '', html: '<div class="lyr lyr-van">🚰</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
}

const toBounds = (m: L.Map): Bounds => {
  const b = m.getBounds()
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }
}

/** Re-run `load` (debounced) whenever the map stops moving. */
function useViewport(onView: (b: Bounds, zoom: number) => void) {
  const map = useMap()
  const timer = useRef<number | undefined>(undefined)
  const fire = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onView(toBounds(map), map.getZoom()), 350)
  }
  useMapEvents({ moveend: fire, zoomend: fire })
  useEffect(() => {
    fire()
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

function PlaceLinks({ lat, lng, website, link, onAdd }: { lat: number; lng: number; website?: string; link?: string; onAdd: () => void }) {
  return (
    <div className="popup-actions">
      <a href={directionsUrl(lat, lng)} target="_blank" rel="noreferrer">Directions</a>
      {website && <a href={website} target="_blank" rel="noreferrer">Website</a>}
      {link && <a href={link} target="_blank" rel="noreferrer">Map info</a>}
      <button type="button" className="link" onClick={onAdd}>Add as stop</button>
    </div>
  )
}

export function CarParkLayer({ onStatus, onAddStop }: { onStatus: (s: LayerStatus) => void; onAddStop: (p: AddPlace) => void }) {
  const [parks, setParks] = useState<CarPark[]>([])
  const req = useRef(0)
  useViewport((b, zoom) => {
    const id = ++req.current
    if (zoom < CAR_PARK_MIN_ZOOM) {
      setParks([])
      onStatus({ text: 'Zoom in to see car parks', tone: 'info' })
      return
    }
    onStatus({ text: 'Loading car parks…', tone: 'info' })
    carParksIn(b)
      .then((list) => {
        if (id !== req.current) return
        setParks(list)
        onStatus(list.length ? null : { text: 'No car parks in view', tone: 'info' })
      })
      .catch((e) => {
        if (id !== req.current) return
        onStatus({ text: (e as Error).message === 'zoom in' ? 'Zoom in to see car parks' : 'Couldn’t load car parks', tone: 'warn' })
      })
  })
  useEffect(() => () => onStatus(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {parks.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={carParkIcon} zIndexOffset={-200}>
          <Popup>
            <strong>{p.name ?? 'Car park'}</strong>
            <div className="popup-sub">Car park · check signs for fees and access</div>
            <PlaceLinks lat={p.lat} lng={p.lng} onAdd={() => onAddStop({ name: p.name ?? 'Car park', lat: p.lat, lng: p.lng, nights: 0 })} />
          </Popup>
        </Marker>
      ))}
    </>
  )
}

export function VanLayer({ onStatus, onAddStop }: { onStatus: (s: LayerStatus) => void; onAddStop: (p: AddPlace) => void }) {
  const [spots, setSpots] = useState<VanSpot[]>([])
  const ctrl = useRef<AbortController | null>(null)
  useViewport((b, zoom) => {
    ctrl.current?.abort()
    if (zoom < VAN_MIN_ZOOM) {
      setSpots([])
      onStatus({ text: 'Zoom in to see overnight spots', tone: 'info' })
      return
    }
    const c = new AbortController()
    ctrl.current = c
    const zoomedIn = zoom >= CAR_PARK_MIN_ZOOM
    let detailed = false
    onStatus({ text: 'Finding overnight spots…', tone: 'info' })
    // 1. Instant: campsites from the map tiles (zoomed in only)
    if (zoomedIn) {
      vanSpotsBasic(b)
        .then((basic) => {
          if (!c.signal.aborted && !detailed) setSpots(basic)
        })
        .catch(() => {})
    }
    // 2. Better: van details from Overpass, replacing the basic list
    vanSpotsDetailed(b, c.signal)
      .then((list) => {
        if (c.signal.aborted) return
        detailed = true
        setSpots(list)
        onStatus(list.length ? null : { text: 'No overnight spots in view', tone: 'info' })
      })
      .catch(() => {
        if (c.signal.aborted) return
        if (!zoomedIn) setSpots([])
        onStatus(
          zoomedIn
            ? { text: 'Map server busy: showing campsites only. Check each allows vans.', tone: 'warn' }
            : { text: 'Map server busy. Zoom in to see campsites.', tone: 'warn' },
        )
      })
  })
  useEffect(() => () => { ctrl.current?.abort(); onStatus(null) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {spots.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={vanIcons[s.kind]} zIndexOffset={-100}>
          <Popup>
            <strong>{s.name ?? VAN_SHORT[s.kind]}</strong>
            <div className="popup-sub">{VAN_LABELS[s.kind]}</div>
            {s.facts.length > 0 && <div className="popup-facts">{s.facts.join(' · ')}</div>}
            <PlaceLinks
              lat={s.lat}
              lng={s.lng}
              website={s.website}
              link={s.link}
              onAdd={() => onAddStop({ name: s.name ?? VAN_SHORT[s.kind], lat: s.lat, lng: s.lng, notes: [VAN_LABELS[s.kind], ...s.facts].join(' · ') })}
            />
          </Popup>
        </Marker>
      ))}
    </>
  )
}
