import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { formatLength, parseLength } from '../utils/units'
import { MAX_SQUARE_CORNERS_TOLERANCE_DEG } from '../utils/squareCorners'
import { UndoableField } from './PropertiesPanel'
import { Overlay } from './Overlay'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const units = useProjectStore((s) => s.project.settings.units)
  const defaultWallThickness = useProjectStore((s) => s.project.settings.defaultWallThickness)
  const squareCornersToleranceDeg = useProjectStore(
    (s) => s.project.settings.squareCornersToleranceDeg,
  )
  const updateSettings = useProjectStore((s) => s.updateSettings)

  const [error, setError] = useState<string | null>(null)
  const [toleranceError, setToleranceError] = useState<string | null>(null)

  function commitWallThickness(raw: string) {
    const result = parseLength(raw, units)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError(null)
    updateSettings({ defaultWallThickness: result.value })
    return true
  }

  /** O3 (#43): degrees, not a length, so this parses a plain number rather
   * than going through parseLength. */
  function commitSquareTolerance(raw: string) {
    const value = Number(raw)
    if (
      raw.trim() === '' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > MAX_SQUARE_CORNERS_TOLERANCE_DEG
    ) {
      setToleranceError(`Enter a number of degrees from 0 to ${MAX_SQUARE_CORNERS_TOLERANCE_DEG}.`)
      return false
    }
    setToleranceError(null)
    updateSettings({ squareCornersToleranceDeg: value })
    return true
  }

  return (
    <Overlay onClose={onClose} className={styles.overlay} contentClassName={styles.modal}>
      <div className={styles.header}>
        <span>Project Settings</span>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Walls</div>
          <UndoableField
            label="Default wall thickness (new rooms)"
            type="text"
            value={defaultWallThickness.toFixed(2)}
            onCommit={commitWallThickness}
          />
          <div className={styles.hint}>{formatLength(defaultWallThickness, units)}</div>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.hint}>
            Applies to rooms drawn after this change. Existing rooms keep their current wall
            thickness and can be overridden individually in the Properties panel.
          </div>
        </div>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Corners</div>
          <UndoableField
            label="Square corners tolerance (degrees)"
            type="number"
            value={String(squareCornersToleranceDeg)}
            onCommit={commitSquareTolerance}
          />
          {toleranceError && <div className={styles.error}>{toleranceError}</div>}
          <div className={styles.hint}>
            The Properties panel&rsquo;s &ldquo;Square corners&rdquo; button snaps room corners
            and interior walls within this many degrees of 90 to exact right angles. Angled walls
            further off than this (bay windows, 45 degree corners) are left alone.
          </div>
        </div>
      </div>
    </Overlay>
  )
}
