import { useState } from 'react'
import type { Trip } from '../types'

interface Props {
  trips: Trip[]
  onOpen: (id: string) => void
  onCreate: (name: string) => void
  onCreateSample: () => void
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function RoadArt() {
  return (
    <svg className="hero-art" viewBox="0 0 320 200" aria-hidden="true">
      <circle cx="250" cy="58" r="30" className="art-sun" />
      <path d="M0 130 L70 80 L120 112 L190 60 L260 104 L320 74 V200 H0 Z" className="art-hills-back" />
      <path d="M0 150 L90 118 L170 146 L250 120 L320 140 V200 H0 Z" className="art-hills" />
      <path d="M150 200 C150 170 175 150 210 140 C235 133 250 128 262 120 L268 122 C258 132 245 140 222 150 C190 164 178 180 182 200 Z" className="art-road" />
      <path d="M166 196 C168 182 178 170 194 162 M206 154 C218 148 230 143 240 137" className="art-lines" />
    </svg>
  )
}

export function Home({ trips, onOpen, onCreate, onCreateSample }: Props) {
  const [name, setName] = useState('')

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-text">
          <h1>Plan the drive.<br />Enjoy the ride.</h1>
          <p>Map out your stops, see the route and driving time, and keep your notes in one place, on your phone or laptop.</p>
          <form
            className="row hero-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) {
                onCreate(name.trim())
                setName('')
              }
            }}
          >
            <input
              placeholder="Name your trip, e.g. Scottish Highlands"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="New trip name"
            />
            <button className="btn primary" type="submit">Start planning</button>
          </form>
        </div>
        <RoadArt />
      </section>

      {trips.length > 0 ? (
        <section>
          <h2>Your trips</h2>
          <ul className="trip-grid">
            {trips.map((t) => {
              const nights = t.stops.reduce((n, s) => n + s.nights, 0)
              return (
                <li key={t.id}>
                  <button type="button" className="trip-card" onClick={() => onOpen(t.id)}>
                    <strong>{t.name}</strong>
                    <span className="trip-route">
                      {t.stops.length === 0
                        ? 'No stops yet'
                        : t.stops.length === 1
                          ? t.stops[0].name
                          : `${t.stops[0].name} → ${t.stops[t.stops.length - 1].name}`}
                    </span>
                    <span className="chips">
                      <span className="chip">{t.stops.length} stop{t.stops.length === 1 ? '' : 's'}</span>
                      {nights > 0 && <span className="chip">{nights} night{nights === 1 ? '' : 's'}</span>}
                      {t.startDate && <span className="chip">{formatDate(t.startDate)}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <section>
          <h2>How it works</h2>
          <ol className="steps">
            <li><span className="step-num">1</span><div><strong>Name your trip</strong><p>Give it a name above to get started.</p></div></li>
            <li><span className="step-num">2</span><div><strong>Add your stops</strong><p>Search for towns, parks or addresses and put them in order.</p></div></li>
            <li><span className="step-num">3</span><div><strong>See the route</strong><p>Get the driving distance and time, and plan nights and dates.</p></div></li>
          </ol>
          <div className="sample">
            <p>Want to see an example first?</p>
            <button className="btn" onClick={onCreateSample}>Open a sample trip</button>
          </div>
        </section>
      )}
    </div>
  )
}
