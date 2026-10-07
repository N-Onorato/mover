import { useEffect } from 'react'
import { ZOOM_STEP } from '../utils/scale'
import { useUIStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'
import { formatShortcut, isTypingTarget, matchesShortcut } from '../keyboard/shortcuts'
import { TOOLBAR_TOOLS, selectTool } from './toolbarTools'
import styles from './Toolbar.module.css'

interface Props {
  /** Present only in the narrow-screen layout: toggles the catalog drawer. */
  onToggleCatalog?: () => void
  /** Present only in the narrow-screen layout: toggles the layers/properties drawer. */
  onTogglePanels?: () => void
}

export function Toolbar({ onToggleCatalog, onTogglePanels }: Props = {}) {
  const activeTool = useUIStore((s) => s.activeTool)
  const scale = useUIStore((s) => s.view.scale)
  const zoomBy = useUIStore((s) => s.zoomBy)
  const snapToGrid = useProjectStore((s) => s.project.settings.snapToGrid)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || isTypingTarget(e.target)) return
      const tool = TOOLBAR_TOOLS.find((t) => matchesShortcut(e, t.shortcutId))
      if (!tool) return
      e.preventDefault()
      selectTool(tool.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
        {TOOLBAR_TOOLS.map((t) => (
          <button
            key={t.id}
            className={`${styles.toolBtn} ${activeTool === t.id ? styles.active : ''}`}
            onClick={() => selectTool(t.id)}
            title={`${t.label} (${formatShortcut(t.shortcutId)})`}
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
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          +
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button
          className={styles.zoomBtn}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
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
