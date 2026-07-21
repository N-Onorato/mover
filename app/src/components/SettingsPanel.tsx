import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { formatLength, parseLength } from '../utils/units'
import { UndoableField } from './PropertiesPanel'
import { Overlay } from './Overlay'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const units = useProjectStore((s) => s.project.settings.units)
  const defaultWallThickness = useProjectStore((s) => s.project.settings.defaultWallThickness)
  const updateSettings = useProjectStore((s) => s.updateSettings)

  const [error, setError] = useState<string | null>(null)

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
      </div>
    </Overlay>
  )
}
