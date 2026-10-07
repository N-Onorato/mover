import { useEffect, useState } from 'react'

export type PresenceState = 'open' | 'closing'

/** Keeps a component mounted for `exitMs` after `open` turns false so it can
 * play a closing animation (driven off `state === 'closing'`) instead of
 * vanishing. Reopening mid-close just flips back to 'open'. Pass 0 to unmount
 * immediately, e.g. under prefers-reduced-motion. */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; state: PresenceState } {
  const [mounted, setMounted] = useState(open)

  // Mount synchronously on open (adjusting state during render, per React's
  // "storing information from previous renders" pattern) so the opening
  // animation starts on the very first frame.
  if (open && !mounted) setMounted(true)

  useEffect(() => {
    if (open || !mounted) return
    if (exitMs <= 0) {
      setMounted(false)
      return
    }
    const id = setTimeout(() => setMounted(false), exitMs)
    return () => clearTimeout(id)
  }, [open, mounted, exitMs])

  // With no exit time, unmount on the closing render itself rather than one
  // effect later.
  return { mounted: open || (mounted && exitMs > 0), state: open ? 'open' : 'closing' }
}
