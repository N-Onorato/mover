import { useState } from 'react'
import { useUIStore, getImageFlowStep } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { distance } from '../utils/geometry'
import { formatLength, parseLength } from '../utils/units'
import {
  applyCalibrationLength,
  cancelImageFlow,
  redoCalibrationLine,
} from '../canvas/tools/ImageTool'
import { Overlay } from './Overlay'
import styles from './CalibrationLengthDialog.module.css'

/** I4 (#23): the last step of the reference-image flow, replacing a bare
 * window.prompt loop. A real dialog can say *why* the length is being asked
 * for, show what was measured, validate inline instead of re-prompting on
 * every typo, and offer a way back to re-draw the line.
 *
 * Renders off drawingState rather than taking props: `points.length === 2` is
 * exactly the "waiting for a length" step, and ImageTool owns that state.
 * Mounted from App (not inside the canvas container) so it isn't trapped in
 * the canvas stacking context.
 */
export function CalibrationLengthDialog() {
  const drawingState = useUIStore((s) => s.drawingState)
  const units = useProjectStore((s) => s.project.settings.units)
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)

  const active = drawingState?.kind === 'calibration' && drawingState.points.length >= 2
  if (!active) return null

  const [p1, p2] = drawingState.points
  const measured = distance(p1, p2)
  const step = getImageFlowStep(drawingState)

  function reset() {
    setRaw('')
    setError(null)
  }

  function handleApply() {
    const result = parseLength(raw, units)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (!applyCalibrationLength(result.value)) {
      setError('That calibration line is too short to measure. Redo the line and try again.')
      return
    }
    reset()
  }

  function handleCancel() {
    reset()
    cancelImageFlow()
  }

  function handleRedo() {
    reset()
    redoCalibrationLine()
  }

  return (
    <Overlay onClose={handleCancel} className={styles.overlay} contentClassName={styles.modal}>
      <div className={styles.header}>
        <span>Set the image scale</span>
        {step && (
          <span className={styles.step}>
            Step {step.index} of {step.total}
          </span>
        )}
        <button className={styles.closeButton} onClick={handleCancel} aria-label="Close">
          ×
        </button>
      </div>
      <div className={styles.body}>
        <p className={styles.purpose}>
          The line you just drew sets the photo&rsquo;s real-world scale. Enter how long it actually
          is and the whole image is resized to match, so everything you trace over it comes out at
          the right size.
        </p>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Real-world length of that line</span>
          <input
            className={styles.input}
            type="text"
            value={raw}
            autoFocus
            placeholder={units === 'imperial' ? `e.g. 7'3"` : 'e.g. 2.2m'}
            onChange={(e) => {
              setRaw(e.target.value)
              if (error) setError(null)
            }}
            // Escape has to be handled here: LayoutCanvas's global key handler
            // early-returns for input targets, so it never sees this one.
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApply()
              else if (e.key === 'Escape') handleCancel()
            }}
          />
        </label>
        <div className={styles.hint}>At the current scale that line reads {formatLength(measured, units)}.</div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.actions}>
          <button className={styles.button} onClick={handleApply} disabled={raw.trim() === ''}>
            Apply
          </button>
          <button className={styles.secondaryButton} onClick={handleRedo}>
            Redo line
          </button>
          <button className={styles.secondaryButton} onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}
