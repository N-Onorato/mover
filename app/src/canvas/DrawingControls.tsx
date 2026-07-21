import { useUIStore } from '../store/uiStore'
import { TOOLS } from './tools'
import { isCoarsePointer } from '../utils/pointer'
import styles from './DrawingControls.module.css'

/** Floating Done / Undo point / Cancel buttons shown over the canvas while a
 * drawing operation is in progress. Touch devices have no Escape, Enter, or
 * Backspace, so these are the only way to finish or bail out of a drawing on
 * a phone. Desktop keeps its keyboard shortcuts and never sees this cluster.
 *
 * H1: the buttons call each tool's onFinish/onUndoStep/onCancel directly -
 * the same methods that tool's own onKeyDown calls for Enter/Backspace/
 * Escape - rather than constructing a synthetic KeyboardEvent and hoping the
 * active tool's key bindings happen to still match. */
export function DrawingControls() {
  const drawingState = useUIStore((s) => s.drawingState)
  const activeTool = useUIStore((s) => s.activeTool)

  if (!isCoarsePointer || !drawingState) return null

  const tool = TOOLS[activeTool]
  const isRoom = drawingState.kind === 'room'
  const canFinish = isRoom && drawingState.points.length >= 3
  const canUndoPoint = isRoom && drawingState.points.length > 1

  return (
    <div className={styles.controls}>
      {isRoom && (
        <button className={styles.btn} disabled={!canFinish} onClick={() => tool?.onFinish?.()}>
          Done
        </button>
      )}
      {isRoom && (
        <button className={styles.btn} disabled={!canUndoPoint} onClick={() => tool?.onUndoStep?.()}>
          Undo point
        </button>
      )}
      <button className={styles.btn} onClick={() => tool?.onCancel?.()}>
        Cancel
      </button>
    </div>
  )
}
