import { formatDuration } from '../geo'
import type { ReactNode } from 'react'
import type { LegInfo, RoadPref } from '../types'

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
}

const OPTIONS: { value: RoadPref; label: string }[] = [
  { value: 'avoid', label: 'Avoid' },
  { value: 'standard', label: 'Standard' },
  { value: 'prefer', label: 'Prefer' },
]

export function LegRow({ leg, pref, avoidFerries, loading, units, toName, onChange, onAvoidFerriesChange, discoverOpen, onToggleDiscover, discover }: Props) {
  const dist = leg ? (units === 'mi' ? leg.distanceKm * 0.621371 : leg.distanceKm) : null

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
        </div>
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
