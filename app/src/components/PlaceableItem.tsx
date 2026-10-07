import type { FurnitureDefinition } from '../types/project'
import { useUIStore } from '../store/uiStore'
import { pixelsPerUnitFor } from '../utils/scale'
import { setFurnitureDragImage } from './dragPreview'
import type { ReactNode } from 'react'
import styles from './CatalogPanel.module.css'

interface Props {
  def: FurnitureDefinition
  /** Called after the item is armed for tap-to-place - the narrow-screen
   * layout uses it to close the catalog drawer so the canvas is tappable. */
  onChosen?: () => void
  /** Row-level controls (rename, delete) for saved pieces. */
  actions?: ReactNode
}

/** One placeable row, shared by the Catalog and Sets tabs so both arm and
 * drag identically. Placement itself needs no per-tab handling: LayoutCanvas
 * resolves the dropped id through the built-in catalog and the user's saved
 * pieces alike. */
export function PlaceableItem({ def, onChosen, actions }: Props) {
  const pendingPlacementDefId = useUIStore((s) => s.pendingPlacementDefId)
  const setPendingPlacement = useUIStore((s) => s.setPendingPlacement)
  const armed = pendingPlacementDefId === def.id

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('application/mover-furniture', def.id)
    // O2 (#42): ghost = the piece's footprint at the canvas's current zoom
    // (LayoutCanvas's pixelsPerUnit), not a snapshot of this list row.
    setFurnitureDragImage(
      e.dataTransfer,
      def,
      pixelsPerUnitFor(useUIStore.getState().view.scale),
    )
    // Dragging is its own placement path - don't leave a stale armed item
    // that would also place on the next canvas click.
    setPendingPlacement(null)
  }

  // Click/tap arms the item for tap-to-place (click again to disarm). This is
  // the placement path for touchscreens, where HTML5 drag-and-drop never
  // fires; on desktop it coexists with drag-and-drop.
  function handleClick() {
    setPendingPlacement(armed ? null : def.id)
    if (!armed) onChosen?.()
  }

  return (
    <div
      className={`${styles.item} ${armed ? styles.armed : ''}`}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
    >
      <div className={styles.itemText}>
        <div className={styles.itemName}>{def.name}</div>
        <div className={styles.itemSize}>
          {def.width}" x {def.depth}"
        </div>
      </div>
      {actions && <div className={styles.itemActions}>{actions}</div>}
    </div>
  )
}
