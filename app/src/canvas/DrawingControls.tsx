import { useUIStore } from '../store/uiStore'
import { TOOLS } from './tools'
import { isCoarsePointer } from '../utils/pointer'
import styles from './DrawingControls.module.css'

/** Floating Done / Undo point / Cancel buttons shown over the canvas while a
 * drawing operation is in progress. Touch devices have no Escape, Enter, or
 * Backspace, so these are the only way to finish or bail out of a drawing on
 * a phone. Desktop keeps its keyboard shortcuts and never sees this cluster.
 *
 * The buttons reuse the tools' existing onKeyDown handlers via synthetic
 * KeyboardEvents, so behavior is identical to pressing the real keys. */
export function DrawingControls() {
  const drawingState = useUIStore((s) => s.drawingState)
  const activeTool = useUIStore((s) => s.activeTool)

  if (!isCoarsePointer || !drawingState) return null

  const sendKey = (key: string) => {
    TOOLS[activeTool]?.onKeyDown(new KeyboardEvent('keydown', { key }))
  }

  const isRoom = drawingState.kind === 'room'
  const canFinish = isRoom && drawingState.points.length >= 3
  const canUndoPoint = isRoom && drawingState.points.length > 1

  return (
    <div className={styles.controls}>
      {isRoom && (
        <button className={styles.btn} disabled={!canFinish} onClick={() => sendKey('Enter')}>
          Done
        </button>
      )}
      {isRoom && (
        <button className={styles.btn} disabled={!canUndoPoint} onClick={() => sendKey('Backspace')}>
          Undo point
        </button>
      )}
      <button className={styles.btn} onClick={() => sendKey('Escape')}>
        Cancel
      </button>
    </div>
  )
}
