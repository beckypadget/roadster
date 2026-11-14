import { formatDuration } from '../geo'
import { useEffect, useState, type ReactNode } from 'react'
import { getAlternatives, type RouteAlternative } from '../routing'
import type { LegInfo, RoadPref, Stop } from '../types'

interface Props {
  leg: LegInfo | undefined
  pref: RoadPref
  avoidFerries: boolean
  loading: boolean
  units: 'km' | 'mi'
  toName: string
  onChange: (p: RoadPref) => void
  onAvoidFerriesChange: (v: boolean) => void
  discoverOpen: boolean
  onToggleDiscover: () => void
  /** The Discover panel, rendered under the leg when open */
  discover?: ReactNode
  from: Stop
  to: Stop
  onRouteChange: (patch: Partial<Stop>) => void
  onPreviewRoutes: (paths: [number, number][][]) => void
}

const OPTIONS: { value: RoadPref; label: string }[] = [
  { value: 'avoid', label: 'Avoid' },
  { value: 'standard', label: 'Standard' },
  { value: 'prefer', label: 'Prefer' },
]

export function LegRow({
  leg, pref, avoidFerries, loading, units, toName, onChange, onAvoidFerriesChange, discoverOpen, onToggleDiscover, discover,
  from, to, onRouteChange, onPreviewRoutes,
}: Props) {
  const conv = (km: number) => (units === 'mi' ? km * 0.621371 : km)
  const dist = leg ? conv(leg.distanceKm) : null
  const fmtD = (km: number) => `${Math.round(conv(km)).toLocaleString()} ${units}`
  const signed = (km: number) => `${km >= 0 ? '+' : '−'}${fmtD(Math.abs(km))}`
  const signedMin = (m: number) => `${m >= 0 ? '+' : '−'}${formatDuration(Math.abs(m))}`

  // Out-and-back: flag legs that repeat a fair amount of earlier roads
  const retraces = !!leg && !leg.estimated && leg.retraceKm > Math.max(1, leg.distanceKm * 0.15)

  // Alternative routes, fetched when the panel opens
  const [altsOpen, setAltsOpen] = useState(false)
  const [alts, setAlts] = useState<RouteAlternative[] | null>(null)
  const [altsError, setAltsError] = useState(false)
  useEffect(() => {
    if (!altsOpen) return
    const ctrl = new AbortController()
    setAlts(null)
    setAltsError(false)
    getAlternatives(from, to, ctrl.signal)
      .then((list) => {
        setAlts(list)
        onPreviewRoutes(list.map((a) => a.path))
      })
      .catch(() => !ctrl.signal.aborted && setAltsError(true))
    return () => {
      ctrl.abort()
      onPreviewRoutes([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altsOpen, from.lat, from.lng, to.lat, to.lng, pref, avoidFerries])
  const choice = to.routeChoice ?? 0

  return (
    <div className="leg" role="group" aria-label={`Drive to ${toName}`}>
      <div className="leg-line" aria-hidden="true" />
      <div className="leg-body">
        <div className="leg-stats">
          {loading || !leg ? (
            <span className="hint">Routing…</span>
          ) : (
            <>
              <span><strong>{Math.round(dist!).toLocaleString()}</strong> {units}</span>
              {leg.durationMin != null && <span>{formatDuration(leg.durationMin)}</span>}
              {leg.hasFerry && <span className="ferry-badge">⛴ {avoidFerries ? 'Ferry needed' : 'Includes a ferry'}</span>}
              {leg.estimated && <span className="hint">straight line, routing unavailable</span>}
            </>
          )}
        </div>
        <div className="seg" role="radiogroup" aria-label={`Motorways on the drive to ${toName}`}>
          <span className="seg-label">Motorways</span>
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={pref === o.value}
              className={pref === o.value ? 'on' : ''}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="leg-tools">
          <label className="check">
            <input type="checkbox" checked={avoidFerries} onChange={(e) => onAvoidFerriesChange(e.target.checked)} />
            Avoid ferries
          </label>
          <button
            type="button"
            className={`discover-btn${discoverOpen ? ' on' : ''}`}
            aria-expanded={discoverOpen}
            disabled={!leg || leg.estimated}
            onClick={onToggleDiscover}
          >
            ✨ Places on the way
          </button>
          <button
            type="button"
            className={`link small-link${altsOpen ? ' on' : ''}`}
            aria-expanded={altsOpen}
            disabled={!leg || leg.estimated}
            onClick={() => setAltsOpen((o) => !o)}
          >
            {altsOpen ? 'Hide other routes' : choice > 0 && !to.avoidRetrace ? `Alternative ${choice} ▾` : 'Other routes'}
          </button>
        </div>
        {retraces && !to.avoidRetrace && (
          <div className="leg-note">
            <span>↩ Retraces {fmtD(leg!.retraceKm)} of an earlier leg</span>
            <button type="button" className="link" onClick={() => onRouteChange({ avoidRetrace: true, routeChoice: 0 })}>
              Try a different road
            </button>
          </div>
        )}
        {to.avoidRetrace && leg && !loading && (
          <div className="leg-note">
            {leg.retraceAvoided === 'yes' ? (
              <span>
                ✓ Different road from earlier legs
                {leg.normalDistanceKm != null && (
                  <> ({signed(leg.distanceKm - leg.normalDistanceKm)}
                    {leg.durationMin != null && leg.normalDurationMin != null && `, ${signedMin(leg.durationMin - leg.normalDurationMin)}`})</>
                )}
              </span>
            ) : (
              <span>No other road here: this is the only way.</span>
            )}
            <button type="button" className="link" onClick={() => onRouteChange({ avoidRetrace: false })}>Undo</button>
          </div>
        )}
        {leg?.choiceMissing && <p className="hint">The route you picked isn’t offered any more, so this is the suggested one.</p>}
        {altsOpen && (
          <div className="alts">
            {!alts && !altsError && <span className="hint">Finding other routes…</span>}
            {altsError && <span className="hint">Couldn’t load other routes just now.</span>}
            {alts?.length === 1 && <span className="hint">No other sensible routes for this leg.</span>}
            {alts && alts.length > 1 && (
              <div role="radiogroup" aria-label={`Route to ${toName}`} className="alt-list">
                {alts.map((a) => (
                  <button
                    key={a.index}
                    type="button"
                    role="radio"
                    aria-checked={!to.avoidRetrace && choice === a.index}
                    className={`alt${!to.avoidRetrace && choice === a.index ? ' on' : ''}`}
                    onClick={() => onRouteChange({ routeChoice: a.index, avoidRetrace: false })}
                  >
                    <strong>{a.index === 0 ? 'Suggested' : `Alternative ${a.index}`}</strong>
                    <span>
                      {fmtD(a.distanceKm)} · {formatDuration(a.durationMin)}
                      {a.index > 0 && alts[0] && ` (${signed(a.distanceKm - alts[0].distanceKm)}, ${signedMin(a.durationMin - alts[0].durationMin)})`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {leg && avoidFerries && leg.hasFerry && (
          <p className="hint">There’s no reasonable way to get here without a ferry.</p>
        )}
        {leg && !leg.estimated && !leg.prefApplied && (
          <p className="hint">Your route settings couldn’t be applied just now (routing service busy). Showing the standard route.</p>
        )}
        {discoverOpen && discover}
      </div>
    </div>
  )
}
