import { useState } from 'react'
import type { Trip } from '../types'

interface Props {
  trips: Trip[]
  onOpen: (id: string) => void
  onCreate: (name: string) => void
}

export function TripList({ trips, onOpen, onCreate }: Props) {
  const [name, setName] = useState('')

  return (
    <div className="panel">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) {
            onCreate(name.trim())
            setName('')
          }
        }}
      >
        <input placeholder="Name a new trip, e.g. Pacific Coast Highway" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" type="submit">New trip</button>
      </form>

      {trips.length === 0 ? (
        <div className="empty">
          <p>No trips yet.</p>
          <p className="hint">Create one above, then add stops along the way.</p>
        </div>
      ) : (
        <ul className="trips">
          {trips.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onOpen(t.id)}>
                <strong>{t.name}</strong>
                <span>
                  {t.stops.length} stop{t.stops.length === 1 ? '' : 's'}
                  {t.stops.length > 1 && ` · ${t.stops[0].name} → ${t.stops[t.stops.length - 1].name}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
