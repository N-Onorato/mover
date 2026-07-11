import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'
import { formatLength, parseLength } from '../utils/units'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const units = useProjectStore((s) => s.project.settings.units)
  const defaultWallThickness = useProjectStore((s) => s.project.settings.defaultWallThickness)
  const updateSettings = useProjectStore((s) => s.updateSettings)

  const [wallThicknessInput, setWallThicknessInput] = useState(defaultWallThickness.toFixed(2))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setWallThicknessInput(defaultWallThickness.toFixed(2))
  }, [defaultWallThickness])

  function commitWallThickness() {
    const result = parseLength(wallThicknessInput, units)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
    updateSettings({ defaultWallThickness: result.value })
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span>Project Settings</span>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Walls</div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Default wall thickness (new rooms)</span>
              <input
                className={styles.input}
                type="text"
                value={wallThicknessInput}
                onChange={(e) => setWallThicknessInput(e.target.value)}
                onBlur={commitWallThickness}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
            </label>
            <div className={styles.hint}>{formatLength(defaultWallThickness, units)}</div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.hint}>
              Applies to rooms drawn after this change. Existing rooms keep their current wall
              thickness and can be overridden individually in the Properties panel.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
