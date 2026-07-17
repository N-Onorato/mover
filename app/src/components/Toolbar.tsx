import { useUIStore, type Tool } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'
import { startImageImport } from '../canvas/tools/ImageTool'
import styles from './Toolbar.module.css'

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'room', label: 'Room' },
  { id: 'interiorWall', label: 'Interior Wall' },
  { id: 'image', label: 'Image' },
  { id: 'annotation', label: 'Annotate' },
]

interface Props {
  /** Present only in the narrow-screen layout: toggles the catalog drawer. */
  onToggleCatalog?: () => void
  /** Present only in the narrow-screen layout: toggles the layers/properties drawer. */
  onTogglePanels?: () => void
}

export function Toolbar({ onToggleCatalog, onTogglePanels }: Props = {}) {
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const snapToGrid = useProjectStore((s) => s.project.settings.snapToGrid)

  const handleToggleSnapToGrid = () => {
    useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
    useProjectStore.getState().toggleSnapToGrid()
  }

  return (
    <div className={styles.toolbar}>
      {onToggleCatalog && (
        <button className={styles.toolBtn} onClick={onToggleCatalog}>
          Catalog
        </button>
      )}
      <div className={styles.tools}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`${styles.toolBtn} ${activeTool === t.id ? styles.active : ''}`}
            onClick={() => (t.id === 'image' ? startImageImport() : setActiveTool(t.id))}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.zoom}>
        <button
          className={`${styles.toolBtn} ${snapToGrid ? styles.active : ''}`}
          onClick={handleToggleSnapToGrid}
          title="Snap to Grid"
        >
          Snap
        </button>
        <button
          className={styles.zoomBtn}
          onClick={() => setView({ ...view, scale: Math.min(10, view.scale * 1.2) })}
        >
          +
        </button>
        <span>{Math.round(view.scale * 100)}%</span>
        <button
          className={styles.zoomBtn}
          onClick={() => setView({ ...view, scale: Math.max(0.1, view.scale / 1.2) })}
        >
          -
        </button>
        {onTogglePanels && (
          <button className={styles.toolBtn} onClick={onTogglePanels}>
            Panels
          </button>
        )}
      </div>
    </div>
  )
}
