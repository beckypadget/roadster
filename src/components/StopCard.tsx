import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import type { Stop } from '../types'

interface Props {
  stop: Stop
  index: number
  count: number
  arrival: string | null
  /** The leg row for the drive to this stop (moves with the stop when dragged) */
  leg?: ReactNode
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

export function StopCard({ stop, index, count, arrival, leg, onUpdate, onMove, onRemove }: Props) {
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
      <div className="stop-num">{index + 1}</div>
      <div className="stop-body">
        <div className="row between">
          <strong>{stop.name}</strong>
          <div className="stop-actions">
            <button className="icon" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
            <button className="icon" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
            <button className="icon" aria-label="Remove stop" onClick={onRemove}>✕</button>
          </div>
        </div>
        {arrival && <div className="hint">Arrive {arrival}</div>}
        <div className="row">
          <label className="field inline">
            Nights
            <input
              type="number"
              min={0}
              value={stop.nights}
              onChange={(e) => onUpdate({ nights: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
        </div>
        <textarea
          placeholder="Notes: where to stay, what to see…"
          value={stop.notes}
          rows={stop.notes ? 2 : 1}
          onChange={(e) => onUpdate({ notes: e.target.value })}
        />
      </div>
      </div>
    </li>
  )
}
