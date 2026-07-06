import { useUIStore } from '../store/uiStore'
import styles from './PropertiesPanel.module.css'

export function PropertiesPanel() {
  const selectedIds = useUIStore((s) => s.selectedIds)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Properties</div>
      <div className={styles.body}>
        {selectedIds.length === 0 && (
          <p className={styles.empty}>Nothing selected</p>
        )}
        {selectedIds.length > 0 && (
          <p className={styles.empty}>{selectedIds.length} item(s) selected</p>
        )}
      </div>
    </div>
  )
}
