import { useRef } from 'react'
import { useHistoryStore } from '../store/historyStore'
import { useProjectStore } from '../store/projectStore'

/** One history snapshot per interaction rather than per change event - a
 * held-down slider or a dragged color swatch would otherwise bury the undo
 * stack under a snapshot per frame. `take` is idempotent until `release`. */
export function useSnapshotOnce() {
  const snapshotTaken = useRef(false)
  return {
    take: () => {
      if (snapshotTaken.current) return
      snapshotTaken.current = true
      useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
    },
    release: () => {
      snapshotTaken.current = false
    },
  }
}

/** useSnapshotOnce bound to a text field's focus/blur - the interaction
 * boundary for a typed edit. */
export function useSnapshotOnFocus() {
  const { take, release } = useSnapshotOnce()
  return { onFocus: take, onBlur: release }
}
