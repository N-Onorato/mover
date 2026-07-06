import { useUIStore } from '../store/uiStore'
import styles from './LayerPanel.module.css'

type LayerKey = 'referenceImages' | 'rooms' | 'furniture' | 'annotations'

const LAYERS: { id: LayerKey; label: string }[] = [
  { id: 'annotations', label: 'Annotations' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'referenceImages', label: 'Reference Images' },
]

export function LayerPanel() {
  const showLayers = useUIStore((s) => s.showLayers)
  const lockedLayers = useUIStore((s) => s.lockedLayers)
  const toggleVisibility = useUIStore((s) => s.toggleLayerVisibility)
  const toggleLock = useUIStore((s) => s.toggleLayerLock)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Layers</div>
      <div className={styles.list}>
        {LAYERS.map((layer) => (
          <div key={layer.id} className={styles.row}>
            <button
              className={`${styles.iconBtn} ${showLayers[layer.id] ? styles.visible : styles.hidden}`}
              onClick={() => toggleVisibility(layer.id)}
              title="Toggle visibility"
            >
              {showLayers[layer.id] ? 'V' : '-'}
            </button>
            <button
              className={`${styles.iconBtn} ${lockedLayers[layer.id] ? styles.locked : ''}`}
              onClick={() => toggleLock(layer.id)}
              title="Toggle lock"
            >
              {lockedLayers[layer.id] ? 'L' : 'U'}
            </button>
            <span className={styles.label}>{layer.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
