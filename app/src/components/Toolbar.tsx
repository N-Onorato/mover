import { useUIStore, type Tool } from '../store/uiStore'
import { startImageImport } from '../canvas/tools/ImageTool'
import styles from './Toolbar.module.css'

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'room', label: 'Room' },
  { id: 'image', label: 'Image' },
  { id: 'annotation', label: 'Annotate' },
]

export function Toolbar() {
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)

  return (
    <div className={styles.toolbar}>
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
        <button onClick={() => setView({ ...view, scale: Math.min(10, view.scale * 1.2) })}>+</button>
        <span>{Math.round(view.scale * 100)}%</span>
        <button onClick={() => setView({ ...view, scale: Math.max(0.1, view.scale / 1.2) })}>-</button>
      </div>
    </div>
  )
}
