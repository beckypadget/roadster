import { useState } from 'react'

interface Props {
  value: number
  label: string
  onChange: (n: number) => void
}

const MAX = 60

/**
 * − n + control for nights. Uses a plain text box (not type="number"), so
 * scrolling the page over it never changes the value.
 */
export function NightsStepper({ value, label, onChange }: Props) {
  // While typing, keep the raw text (so the box can be briefly empty)
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? String(value)

  const set = (n: number) => onChange(Math.min(MAX, Math.max(0, n)))
  const commit = () => {
    const n = parseInt(text, 10)
    if (!Number.isNaN(n)) set(n)
    setDraft(null)
  }

  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="One fewer night" disabled={value <= 0} onClick={() => set(value - 1)}>−</button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/\D/g, '').slice(0, 2)
          setDraft(t)
          if (t !== '') set(parseInt(t, 10))
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); set(value + 1) }
          if (e.key === 'ArrowDown') { e.preventDefault(); set(value - 1) }
          if (e.key === 'Enter') commit()
        }}
      />
      <button type="button" aria-label="One more night" disabled={value >= MAX} onClick={() => set(value + 1)}>+</button>
    </div>
  )
}
