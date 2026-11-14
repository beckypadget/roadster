import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RouteInfo, Stop } from '../types'

function numberedIcon(n: number, last: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="pin${last ? ' pin-end' : ''}">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function FitBounds({ stops }: { stops: Stop[] }) {
  const map = useMap()
  useEffect(() => {
    if (stops.length === 1) map.setView([stops[0].lat, stops[0].lng], 10)
    else if (stops.length > 1)
      map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng])), { padding: [40, 40] })
  }, [map, stops])
  return null
}

export function TripMap({ stops, route }: { stops: Stop[]; route: RouteInfo | null }) {
  return (
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
      {stops.map((s, i) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={numberedIcon(i + 1, i === stops.length - 1 && i > 0)}>
          <Popup>
            <strong>{s.name}</strong>
            {s.nights > 0 && <div>{s.nights} night{s.nights > 1 ? 's' : ''}</div>}
          </Popup>
        </Marker>
      ))}
      <FitBounds stops={stops} />
    </MapContainer>
  )
}
