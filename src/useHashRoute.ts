import { useEffect, useState } from 'react'

export type Route = { page: 'home' } | { page: 'trip'; id: string }

function parse(hash: string): Route {
  const m = hash.match(/^#\/trip\/([\w-]+)$/)
  return m ? { page: 'trip', id: m[1] } : { page: 'home' }
}

/**
 * Tiny hash router (#/ and #/trip/<id>). Hash URLs work on any static host,
 * and the browser/phone back button moves between pages.
 */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const go = (r: Route) => {
    location.hash = r.page === 'trip' ? `#/trip/${r.id}` : '#/'
  }
  return { route, go }
}
