import { useSyncExternalStore } from 'react'

/** Reactively track a CSS media query (e.g. '(max-width: 768px)'). */
export function useMediaQuery(query: string): boolean {
  const mql = getCachedMql(query)
  return useSyncExternalStore(
    (onChange) => {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => mql.matches,
  )
}

// getSnapshot must return a value derived from an object stable across
// renders (matchMedia() allocates a new MediaQueryList every call), otherwise
// useSyncExternalStore would query a fresh MediaQueryList on every render just
// to read .matches.
const mqlCache = new Map<string, MediaQueryList>()

function getCachedMql(query: string): MediaQueryList {
  let mql = mqlCache.get(query)
  if (!mql) {
    mql = window.matchMedia(query)
    mqlCache.set(query, mql)
  }
  return mql
}
