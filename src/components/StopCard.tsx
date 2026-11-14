import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import type { Stop } from '../types'
import { NightsStepper } from './NightsStepper'

interface Props {
  stop: Stop
  index: number
  count: number
  /** Number shown in the circle (night or stop number), or null for a dot */
  badge: string | null
  /** e.g. "Nights 1–2", or null when there are no nights here */
  nightsLabel: string | null
  arrival: string | null
  /** The leg row for the drive to this stop (moves with the stop when dragged) */
  leg?: ReactNode
  /** Saved plans list (rendered under notes) */
  plans?: ReactNode
  discoverOpen: boolean
  onToggleDiscover: () => void
  /** The Discover panel for this stop, when open */
  discover?: ReactNode
  onUpdate: (patch: Partial<Stop>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}

export function GripIcon() {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
      {[4, 10, 16].map((y) => (
        <g key={y}>
          <circle cx="4" cy={y} r="1.7" />
          <circle cx="10" cy={y} r="1.7" />
        </g>
      ))}
    </svg>
  )
}

export function StopCard({ stop, index, count, badge, nightsLabel, arrival, leg, plans, discoverOpen, onToggleDiscover, discover, onUpdate, onMove, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
  })

  return (
    <li
      ref={setNodeRef}
      className={`stop-item${isDragging ? ' placeholder' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {leg}
      <div className="stop">
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="grip"
        aria-label={`Drag to reorder ${stop.name}`}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <div className={`stop-num${badge == null ? ' stop-num-dot' : ''}`} aria-label={badge == null ? 'No nights here' : undefined}>
        {badge != null && badge}
      </div>
      <div className="stop-body">
        <div className="row between">
          <strong>{stop.name}</strong>
          <div className="stop-actions">
            <button className="icon" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
            <button className="icon" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
            <button className="icon" aria-label="Remove stop" onClick={onRemove}>✕</button>
          </div>
        </div>
        {(arrival || nightsLabel) && (
          <div className="hint">{[arrival && `Arrive ${arrival}`, nightsLabel].filter(Boolean).join(' · ')}</div>
        )}
        <div className="row">
          <span className="field inline">
            Nights
            <NightsStepper value={stop.nights} label={`Nights in ${stop.name}`} onChange={(nights) => onUpdate({ nights })} />
          </span>
        </div>
        <textarea
          placeholder="Notes: where to stay, what to see…"
          value={stop.notes}
          rows={stop.notes ? 2 : 1}
          onChange={(e) => onUpdate({ notes: e.target.value })}
        />
        {plans}
        <button
          type="button"
          className={`discover-btn${discoverOpen ? ' on' : ''}`}
          aria-expanded={discoverOpen}
          onClick={onToggleDiscover}
        >
          ✨ Things to do nearby
        </button>
      </div>
      </div>
      {discoverOpen && <div className="discover-wrap">{discover}</div>}
    </li>
  )
}
