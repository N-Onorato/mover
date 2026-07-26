import { useUIStore, getImageFlowStep, IMAGE_FLOW_STEPS } from '../store/uiStore'
import { TOOLS } from './tools'
import styles from './FlowIndicator.module.css'

/** I4 (#23): a floating card, top-center over the canvas, showing which step
 * of the reference-image import the user is on and what it wants from them.
 *
 * Deliberately a sibling of DrawingControls rather than part of it.
 * DrawingControls is hard-gated on `isCoarsePointer` because its buttons
 * stand in for keys touch devices don't have; this is *guidance*, equally
 * needed with a keyboard attached, and belongs top-center rather than in that
 * bottom-center command cluster. Merging them would mean threading two
 * pointer-type gates and two layouts through one component.
 *
 * Copy comes from IMAGE_FLOW_STEPS so the card and the status bar can't
 * disagree. Rendered only for the image flow - the room and interior-wall
 * tools are single-click and don't need narrating.
 */
export function FlowIndicator() {
  const drawingState = useUIStore((s) => s.drawingState)
  const activeTool = useUIStore((s) => s.activeTool)

  const step = getImageFlowStep(drawingState)
  if (!step) return null

  return (
    <div className={styles.indicator}>
      <div className={styles.chips} aria-hidden="true">
        {IMAGE_FLOW_STEPS.map((s) => (
          <span
            key={s.id}
            className={`${styles.chip} ${
              s.index < step.index ? styles.chipDone : s.index === step.index ? styles.chipCurrent : ''
            }`}
          />
        ))}
      </div>
      <div aria-live="polite">
        <div className={styles.label}>
          Step {step.index} of {step.total}: {step.label}
        </div>
        <div className={styles.hint}>{step.hint}</div>
      </div>
      <button className={styles.cancel} onClick={() => TOOLS[activeTool]?.onCancel?.()}>
        Cancel
      </button>
    </div>
  )
}
