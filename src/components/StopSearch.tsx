import { useRef, useState } from 'react'
import { searchPlaces, type PlaceResult } from '../search'
import type { Stop } from '../types'

interface Props {
  stops: Stop[]
  units: 'km' | 'mi'
  onAdd: (p: PlaceResult) => void
}

function formatDistance(km: number, units: 'km' | 'mi') {
  const d = units === 'mi' ? km * 0.621371 : km
  return `${d < 10 ? d.toFixed(1) : Math.round(d).toLocaleString()} ${units}`
}

export function StopSearch({ stops, units, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle')
  const inFlight = useRef<AbortController | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    inFlight.current?.abort()
    const ctrl = new AbortController()
    inFlight.current = ctrl
    setStatus('loading')
    try {
      const r = await searchPlaces(query.trim(), stops, ctrl.signal)
      setResults(r)
      setStatus(r.length ? 'idle' : 'empty')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setStatus('error')
    }
  }

  const pick = (p: PlaceResult) => {
    onAdd(p)
    setResults([])
    setQuery('')
  }

  return (
    <div className="search">
      <form onSubmit={submit} className="row">
        <input
          type="search"
          placeholder="Add a stop: town, park, address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search for a place"
        />
        <button type="submit" className="btn primary" disabled={status === 'loading'}>
          {status === 'loading' ? '…' : 'Search'}
        </button>
      </form>
      {status === 'error' && <p className="hint">Search failed. Check your connection and try again.</p>}
      {status === 'empty' && <p className="hint">No places found.</p>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => pick(r)}>
                <span className="result-top">
                  <strong>{r.name}</strong>
                  {r.nearestKm != null && (
                    <span className="result-dist">
                      {r.nearestKm < 1 ? 'here' : `${formatDistance(r.nearestKm, units)} from ${r.nearestStop}`}
                    </span>
                  )}
                </span>
                <span>{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
