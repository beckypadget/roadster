import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string // yyyy-mm-dd or ''
  totalNights: number
  onChange: (v: string) => void
}

const fmt = (iso: string, days = 0) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * The trip's start date, shown as a quiet line under the trip name. It's
 * usually set once, so it stays out of the way until tapped.
 */
export function StartDate({ value, totalNights, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    input.current?.focus()
    try {
      input.current?.showPicker?.()
    } catch {
      /* some browsers only allow this from a direct tap */
    }
  }, [editing])

  if (editing) {
    return (
      <div className="start-date editing">
        <span aria-hidden="true">📅</span>
        <input
          ref={input}
          type="date"
          value={value}
          aria-label="Trip start date"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
        />
        <button type="button" className="link" onClick={() => setEditing(false)}>Done</button>
        {value && (
          <button type="button" className="link muted-link" onClick={() => { onChange(''); setEditing(false) }}>Clear</button>
        )}
      </div>
    )
  }

  return (
    <button type="button" className="start-date" onClick={() => setEditing(true)}>
      <span aria-hidden="true">📅</span>
      {value ? (
        <>
          <span>{totalNights > 0 ? `${fmt(value)} – ${fmt(value, totalNights)}` : `Starts ${fmt(value)}`}</span>
          <span className="start-date-change">Change</span>
        </>
      ) : (
        <span className="start-date-change">Add a start date</span>
      )}
    </button>
  )
}
