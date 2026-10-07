import { useEffect, useRef, useState } from 'react'
import { Stage } from 'react-konva'
import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../store/uiStore'
import { GridLayer } from './layers/GridLayer'
import { ReferenceImageLayer } from './layers/ReferenceImageLayer'
import { RoomLayer } from './layers/RoomLayer'
import { InteriorWallLayer } from './layers/InteriorWallLayer'
import { FurnitureLayer } from './layers/FurnitureLayer'
import { AnnotationLayer } from './layers/AnnotationLayer'
import { pixelsPerUnitFor } from '../utils/scale'
import styles from './ComparisonPane.module.css'

interface Props {
  layoutId: string
}

/** L1 (#28): a read-only view of one furniture layout, drawn beside the
 * editable canvas in compare mode.
 *
 * Deliberately not a second editable canvas. Selection, drag state and the
 * active tool are single-valued in `uiStore` (one selection, one in-flight
 * drag), so two live canvases would either fight over that state or need it
 * duplicated per layout. Instead exactly one layout is editable at a time -
 * the active one - and clicking a pane makes it the active one, which the
 * wrapping LayoutWorkspace handles. That keeps a single interaction model and
 * still answers the question the feature is for: how do these arrangements
 * compare, side by side, right now.
 *
 * Everything except furniture is shared project state, so the panes draw the
 * same rooms, walls and reference images; only the FurnitureLayer differs.
 * The view transform comes from the same `uiStore.view` the main canvas uses,
 * so panning or zooming anywhere moves every pane together - without that,
 * two panes could be showing different parts of the plan and comparing them
 * would be meaningless.
 */
export function ComparisonPane({ layoutId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 400, height: 600 })

  const view = useUIStore((s) => s.view)
  const showGrid = useUIStore((s) => s.showGrid)
  const settings = useProjectStore((s) => s.project.settings)

  const pixelsPerUnit = pixelsPerUnitFor(view.scale)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{ background: settings.backgroundColor }}
    >
      {/* listening={false}: no hit graph, no cursor changes, no way for a
       * stray pointer event to reach a tool. The pane's click-to-activate is
       * handled by the DOM wrapper above it, not by Konva. */}
      <Stage width={size.width} height={size.height} x={view.x} y={view.y} listening={false}>
        {showGrid && (
          <GridLayer
            pixelsPerUnit={pixelsPerUnit}
            gridSize={settings.gridSize}
            viewX={view.x}
            viewY={view.y}
            zoom={view.scale}
            width={size.width}
            height={size.height}
            units={settings.units}
            rulerMode={settings.rulerMode}
          />
        )}
        <ReferenceImageLayer pixelsPerUnit={pixelsPerUnit} />
        <RoomLayer pixelsPerUnit={pixelsPerUnit} />
        <InteriorWallLayer pixelsPerUnit={pixelsPerUnit} units={settings.units} />
        <FurnitureLayer pixelsPerUnit={pixelsPerUnit} layoutId={layoutId} />
        <AnnotationLayer />
      </Stage>
    </div>
  )
}
