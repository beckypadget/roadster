import { categoryInfo, wikipediaUrl } from '../discover'
import type { Plan } from '../types'

interface Props {
  plans: Plan[]
  onToggleDone: (id: string) => void
  onRemove: (id: string) => void
  onFocus: (p: Plan) => void
}

export function PlanList({ plans, onToggleDone, onRemove, onFocus }: Props) {
  const onTheWay = plans.filter((p) => p.onTheWay)
  const here = plans.filter((p) => !p.onTheWay)
  const section = (title: string, items: Plan[]) =>
    items.length > 0 && (
      <div className="plan-section">
        <div className="plan-heading">{title}</div>
        <ul className="plans">
          {items.map((p) => (
            <li key={p.id} className={p.done ? 'done' : ''}>
              <input
                type="checkbox"
                checked={!!p.done}
                onChange={() => onToggleDone(p.id)}
                aria-label={`Mark ${p.title} as visited`}
              />
              <button type="button" className="plan-name" onClick={() => onFocus(p)} title="Show on map">
                <span aria-hidden="true">{categoryInfo(p.category).icon}</span> {p.title}
              </button>
              <a className="icon" href={p.link ?? wikipediaUrl(p.title)} target="_blank" rel="noreferrer" aria-label={`More about ${p.title}`}>ⓘ</a>
              <button type="button" className="icon" aria-label={`Remove ${p.title}`} onClick={() => onRemove(p.id)}>✕</button>
            </li>
          ))}
        </ul>
      </div>
    )
  return (
    <>
      {section('On the way here', onTheWay)}
      {section('Things to do', here)}
    </>
  )
}
