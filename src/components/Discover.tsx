import { useEffect, useMemo, useState } from 'react'
import {
  CATEGORIES, categoryInfo, fetchExtract, mixCategories, suggestAlong, suggestNear, wikipediaUrl,
  type Category, type Suggestion,
} from '../discover'

interface Props {
  /** 'stop': near a point; 'leg': along a route path */
  mode: 'stop' | 'leg'
  center?: { lat: number; lng: number }
  path?: [number, number][]
  placeName: string
  units: 'km' | 'mi'
  /** Titles already saved anywhere in the trip, so we can show "Saved" */
  savedTitles: Set<string>
  onAddPlan: (s: Suggestion) => void
  onAddStop: (s: Suggestion) => void
  onResults: (list: Suggestion[]) => void
  onFocus: (s: Suggestion) => void
  onClose: () => void
}

const PAGE = 12

function fmt(km: number, units: 'km' | 'mi') {
  const d = units === 'mi' ? km * 0.621371 : km
  return d < 1 ? `<1 ${units}` : `${Math.round(d)} ${units}`
}

export function Discover({ mode, center, path, placeName, units, savedTitles, onAddPlan, onAddStop, onResults, onFocus, onClose }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [all, setAll] = useState<Suggestion[]>([])
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const [shown, setShown] = useState(PAGE)
  const [retry, setRetry] = useState(0)
  const key = mode === 'stop' ? `${center?.lat},${center?.lng}` : `${path?.length}-${path?.[0]}-${path?.[path.length - 1]}`

  useEffect(() => {
    const ctrl = new AbortController()
    setStatus('loading')
    const run = mode === 'stop' ? suggestNear(center!, ctrl.signal) : suggestAlong(path ?? [], ctrl.signal)
    run
      .then((list) => {
        setAll(list)
        setStatus('ready')
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setStatus('error')
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry])

  const visible = useMemo(
    () => (filter === 'all' ? mixCategories(all) : all.filter((s) => s.category === filter)),
    [all, filter],
  )
  const page = visible.slice(0, shown)

  // Tell the map what to show; clear it when the panel closes
  useEffect(() => {
    onResults(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.map((s) => s.title).join('|')])
  useEffect(() => () => onResults([]), []) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = new Map<Category, number>()
    all.forEach((s) => c.set(s.category, (c.get(s.category) ?? 0) + 1))
    return c
  }, [all])

  return (
    <section className="discover" aria-label={mode === 'stop' ? `Things to do near ${placeName}` : `Places along the way to ${placeName}`}>
      <div className="row between">
        <strong className="discover-title">
          {mode === 'stop' ? `Near ${placeName}` : `On the way to ${placeName}`}
        </strong>
        <button type="button" className="icon" aria-label="Close suggestions" onClick={onClose}>✕</button>
      </div>

      {status === 'loading' && <p className="hint">Finding places…</p>}
      {status === 'error' && (
        <p className="hint">
          Couldn’t load suggestions. <button type="button" className="link" onClick={() => setRetry((n) => n + 1)}>Try again</button>
        </p>
      )}
      {status === 'ready' && all.length === 0 && (
        <p className="hint">No notable places found {mode === 'stop' ? 'nearby' : 'close to the route'}.</p>
      )}

      {status === 'ready' && all.length > 0 && (
        <>
          <div className="chips filter-chips" role="tablist" aria-label="Filter by type">
            <button type="button" role="tab" aria-selected={filter === 'all'} className={`chip-btn${filter === 'all' ? ' on' : ''}`} onClick={() => { setFilter('all'); setShown(PAGE) }}>
              All {all.length}
            </button>
            {CATEGORIES.filter((c) => counts.get(c.id)).map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={filter === c.id} className={`chip-btn${filter === c.id ? ' on' : ''}`} onClick={() => { setFilter(c.id); setShown(PAGE) }}>
                {c.icon} {c.label} {counts.get(c.id)}
              </button>
            ))}
          </div>

          <ul className="suggestions">
            {page.map((s) => (
              <SuggestionCard
                key={s.title}
                s={s}
                mode={mode}
                units={units}
                saved={savedTitles.has(s.title)}
                onAddPlan={() => onAddPlan(s)}
                onAddStop={() => onAddStop(s)}
                onFocus={() => onFocus(s)}
              />
            ))}
          </ul>
          {visible.length > shown && (
            <button type="button" className="btn small more" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({visible.length - shown})
            </button>
          )}
          <p className="hint attribution">Places and photos from Wikipedia.</p>
        </>
      )}
    </section>
  )
}

function SuggestionCard({ s, mode, units, saved, onAddPlan, onAddStop, onFocus }: {
  s: Suggestion
  mode: 'stop' | 'leg'
  units: 'km' | 'mi'
  saved: boolean
  onAddPlan: () => void
  onAddStop: () => void
  onFocus: () => void
}) {
  const [extract, setExtract] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const toggle = () => {
    setOpen((o) => !o)
    if (extract == null) fetchExtract(s.title).then(setExtract).catch(() => setExtract(''))
  }
  const cat = categoryInfo(s.category)

  return (
    <li className="suggestion">
      <button type="button" className="sugg-main" onClick={onFocus} title="Show on map">
        {s.thumbnail ? (
          <img src={s.thumbnail} alt="" loading="lazy" className="sugg-img" />
        ) : (
          <span className="sugg-img sugg-icon" aria-hidden="true">{cat.icon}</span>
        )}
        <span className="sugg-text">
          <strong>{s.title}</strong>
          <span className="sugg-desc">{s.description}</span>
          <span className="sugg-meta">
            {cat.icon} {cat.label} · {fmt(s.distanceKm, units)} {mode === 'stop' ? 'away' : 'off route'}
          </span>
        </span>
      </button>
      {open && (
        <p className="sugg-extract">
          {extract == null ? 'Loading…' : extract || 'No summary available.'}{' '}
          <a href={wikipediaUrl(s.title)} target="_blank" rel="noreferrer">Wikipedia ↗</a>
        </p>
      )}
      <div className="sugg-actions">
        <button type="button" className="link" onClick={toggle} aria-expanded={open}>{open ? 'Less' : 'More'}</button>
        <span className="spacer" />
        {saved ? (
          <span className="saved">✓ Saved</span>
        ) : (
          <>
            <button type="button" className="btn small" onClick={onAddStop}>Add as stop</button>
            <button type="button" className="btn small primary" onClick={onAddPlan}>Add to plans</button>
          </>
        )}
      </div>
    </li>
  )
}
