import { useState } from 'react'
import { searchPlaces, type PlaceResult } from '../geo'

export function StopSearch({ onAdd }: { onAdd: (p: PlaceResult) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setStatus('loading')
    try {
      const r = await searchPlaces(query.trim())
      setResults(r)
      setStatus(r.length ? 'idle' : 'empty')
    } catch {
      setStatus('error')
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
                <strong>{r.name}</strong>
                <span>{r.fullName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
