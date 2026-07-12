import { useState } from 'react'
import catalog from '../furniture/catalog'
import type { FurnitureDefinition } from '../types/project'
import { useUIStore } from '../store/uiStore'
import styles from './CatalogPanel.module.css'

interface Props {
  /** Called after an item is armed for tap-to-place. The narrow-screen layout
   * uses this to close the catalog drawer so the canvas is tappable. */
  onItemChosen?: () => void
}

export function CatalogPanel({ onItemChosen }: Props = {}) {
  const [query, setQuery] = useState('')
  const pendingPlacementDefId = useUIStore((s) => s.pendingPlacementDefId)
  const setPendingPlacement = useUIStore((s) => s.setPendingPlacement)

  const filtered = query
    ? catalog.filter(
        (d) =>
          d.name.toLowerCase().includes(query.toLowerCase()) ||
          d.tags.some((t) => t.includes(query.toLowerCase())),
      )
    : catalog

  function handleDragStart(e: React.DragEvent, def: FurnitureDefinition) {
    e.dataTransfer.setData('application/mover-furniture', def.id)
    // Dragging is its own placement path - don't leave a stale armed item
    // that would also place on the next canvas click.
    setPendingPlacement(null)
  }

  // Click/tap arms the item for tap-to-place (click again to disarm). This is
  // the placement path for touchscreens, where HTML5 drag-and-drop never
  // fires; on desktop it coexists with drag-and-drop.
  function handleClick(def: FurnitureDefinition) {
    const arming = pendingPlacementDefId !== def.id
    setPendingPlacement(arming ? def.id : null)
    if (arming) onItemChosen?.()
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Catalog</div>
      <input
        className={styles.search}
        placeholder="Search furniture..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={styles.list}>
        {filtered.map((def) => (
          <div
            key={def.id}
            className={`${styles.item} ${pendingPlacementDefId === def.id ? styles.armed : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, def)}
            onClick={() => handleClick(def)}
          >
            <div className={styles.itemName}>{def.name}</div>
            <div className={styles.itemSize}>
              {def.width}" x {def.depth}"
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
