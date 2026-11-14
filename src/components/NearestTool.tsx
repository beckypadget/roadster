import L from 'leaflet'
import { useRef, useState } from 'react'
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import {
  VAN_LABELS, VAN_SHORT, directionsUrl, nearestCarParks, nearestVanSpots,
  type CarPark, type Nearest, type VanSpot,
} from '../mapLayers'
import type { AddPlace } from './MapLayers'

type Pt = { lat: number; lng: number }
type Mode = 'parking' | 'van'

interface Result {
  id: string
  lat: number
  lng: number
  name: string
  detail: string
  distanceKm: number
  website?: string
  notes?: string
  nights: number
}

const resultIcon = (n: number) =>
  L.divIcon({ className: '', html: `<div class="near-pin">${n}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] })

const fromParks = (list: Nearest<CarPark>[]): Result[] =>
  list.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, name: c.name ?? 'Car park', detail: 'Car park', distanceKm: c.distanceKm, nights: 0 }))
const fromVans = (list: Nearest<VanSpot>[]): Result[] =>
  list.map((v) => ({
    id: v.id, lat: v.lat, lng: v.lng, name: v.name ?? VAN_SHORT[v.kind],
    detail: [VAN_LABELS[v.kind], ...v.facts].join(' · '), distanceKm: v.distanceKm,
    website: v.website, notes: [VAN_LABELS[v.kind], ...v.facts].join(' · '), nights: 1,
  }))

/**
 * Tap an empty spot on the map to find the nearest car parks or overnight spots
 * to it, with directions. Tapping while another popup is open just closes it.
 */
export function NearestTool({ units, onAddStop }: { units: 'km' | 'mi'; onAddStop: (p: AddPlace) => void }) {
  const map = useMap()
  const [point, setPoint] = useState<Pt | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [results, setResults] = useState<Result[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [note, setNote] = useState<string | null>(null)
  // When the tap that reaches us also closed a popup, it was meant to close it
  const lastPopupClose = useRef(0)
  const ctrl = useRef<AbortController | null>(null)

  useMapEvents({
    popupclose: () => { lastPopupClose.current = Date.now() },
    click: (e) => {
      if (Date.now() - lastPopupClose.current < 400) return // that tap closed a popup
      ctrl.current?.abort()
      setPoint({ lat: e.latlng.lat, lng: e.latlng.lng })
      setMode(null)
      setResults(null)
      setStatus('idle')
      setNote(null)
    },
  })

  const fmt = (km: number) => {
    const d = units === 'mi' ? km * 0.621371 : km
    return `${d < 10 ? d.toFixed(1) : Math.round(d)} ${units}`
  }

  const search = (m: Mode) => {
    if (!point) return
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setMode(m)
    setResults(null)
    setNote(null)
    setStatus('loading')
    const run =
      m === 'parking'
        ? nearestCarParks(point).then(({ list, searchedKm }) => {
            if (!list.length) setNote(`No car parks within ${fmt(searchedKm)}.`)
            return fromParks(list)
          })
        : nearestVanSpots(point, 3, c.signal).then(({ list, detailed }) => {
            if (!detailed) setNote('Map server busy: showing nearby campsites only. Check they take vans.')
            else if (!list.length) setNote(`No overnight spots within ${fmt(30)}.`)
            return fromVans(list)
          })
    run
      .then((r) => {
        if (c.signal.aborted) return
        setResults(r)
        setStatus('idle')
        if (r.length) map.fitBounds(L.latLngBounds([[point.lat, point.lng], ...r.map((x) => [x.lat, x.lng] as [number, number])]), { paddingTopLeft: [60, 170], paddingBottomRight: [60, 40], maxZoom: 15 })
      })
      .catch(() => !c.signal.aborted && setStatus('error'))
  }

  const close = () => {
    ctrl.current?.abort()
    setPoint(null)
    setResults(null)
    setMode(null)
  }

  if (!point) return null
  return (
    <>
      <Popup position={[point.lat, point.lng]} eventHandlers={{ remove: close }} className="nearest-popup" maxWidth={280} autoPan autoPanPaddingTopLeft={[20, 150]} autoPanPaddingBottomRight={[20, 20]}>
        <div className="nearest">
          <strong>Near this spot</strong>
          <div className="nearest-buttons">
            <button type="button" className={`chip-btn${mode === 'parking' ? ' on' : ''}`} onClick={() => search('parking')}>🅿 Car parks</button>
            <button type="button" className={`chip-btn${mode === 'van' ? ' on' : ''}`} onClick={() => search('van')}>🚐 Overnight spots</button>
          </div>
          {status === 'loading' && <div className="popup-sub">{mode === 'van' ? 'Finding overnight spots (can take a few seconds)…' : 'Finding car parks…'}</div>}
          {status === 'error' && <div className="popup-sub">Couldn’t search just now. Try again.</div>}
          {note && <div className="popup-sub">{note}</div>}
          {results && results.length > 0 && (
            <ol className="nearest-list">
              {results.map((r, i) => (
                <li key={r.id}>
                  <span className="near-pin small" aria-hidden="true">{i + 1}</span>
                  <div>
                    <div><strong>{r.name}</strong> <span className="popup-sub">{fmt(r.distanceKm)}</span></div>
                    {r.detail !== r.name && <div className="popup-sub">{r.detail}</div>}
                    <div className="popup-actions">
                      <a href={directionsUrl(r.lat, r.lng)} target="_blank" rel="noreferrer">Directions</a>
                      {r.website && <a href={r.website} target="_blank" rel="noreferrer">Website</a>}
                      <button type="button" className="link" onClick={() => onAddStop({ name: r.name, lat: r.lat, lng: r.lng, notes: r.notes, nights: r.nights })}>Add as stop</button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {results && results.length > 0 && <div className="popup-sub">Distances are in a straight line from this spot.</div>}
        </div>
      </Popup>
      {results?.map((r, i) => (
        <Marker key={`near-${r.id}`} position={[r.lat, r.lng]} icon={resultIcon(i + 1)} zIndexOffset={900} interactive={false} />
      ))}
    </>
  )
}
