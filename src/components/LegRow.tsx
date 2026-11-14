import { formatDuration } from '../geo'
import type { LegInfo, RoadPref } from '../types'

interface Props {
  leg: LegInfo | undefined
  pref: RoadPref
  loading: boolean
  units: 'km' | 'mi'
  toName: string
  onChange: (p: RoadPref) => void
}

const OPTIONS: { value: RoadPref; label: string }[] = [
  { value: 'avoid', label: 'Avoid' },
  { value: 'standard', label: 'Standard' },
  { value: 'prefer', label: 'Prefer' },
]

export function LegRow({ leg, pref, loading, units, toName, onChange }: Props) {
  const dist = leg ? (units === 'mi' ? leg.distanceKm * 0.621371 : leg.distanceKm) : null

  return (
    <li className="leg" aria-label={`Drive to ${toName}`}>
      <div className="leg-line" aria-hidden="true" />
      <div className="leg-body">
        <div className="leg-stats">
          {loading || !leg ? (
            <span className="hint">Routing…</span>
          ) : (
            <>
              <span><strong>{Math.round(dist!).toLocaleString()}</strong> {units}</span>
              {leg.durationMin != null && <span>{formatDuration(leg.durationMin)}</span>}
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
        {leg && !leg.estimated && !leg.prefApplied && (
          <p className="hint">The motorway setting couldn’t be applied just now (routing service busy). Showing the standard route.</p>
        )}
      </div>
    </li>
  )
}
