import { Fragment } from 'react'
import { Layer, Rect, Text } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'
import { useUIStore } from '../../store/uiStore'
import { withFurnitureDragPreview } from './dragPreview'
import { activeFurnitureLayout, activeFurnitureInstances, layoutFurniture } from '../../project/layouts'

interface Props {
  pixelsPerUnit: number
  /** Which furniture layout to draw. Defaults to the active one - the main
   * canvas. A comparison pane passes its own id (L1, #28) and, since only the
   * active layout is editable, gets no drag preview: `dragState` describes a
   * gesture on the active layout's instances, whose ids don't exist here. */
  layoutId?: string
}

export function FurnitureLayer({ pixelsPerUnit: ppu, layoutId }: Props) {
  const instances = useProjectStore((s) =>
    layoutId === undefined ? activeFurnitureInstances(s.project) : layoutFurniture(s.project, layoutId),
  )
  // Resolved through activeFurnitureLayout (not the raw id) so a pane for the
  // layout a dangling active id falls back to still previews its own drags.
  const isActiveLayout = useProjectStore(
    (s) => layoutId === undefined || layoutId === activeFurnitureLayout(s.project)?.id,
  )
  const dragStateRaw = useUIStore((s) => s.dragState)
  const showLayer = useUIStore((s) => s.showLayers.furniture)
  const dragState = isActiveLayout ? dragStateRaw : null

  if (!showLayer) return <Layer />

  return (
    <Layer>
      {instances.filter((f) => f.visible).map((f) => {
        const { x, y, width, depth, rotation } = withFurnitureDragPreview(f, dragState)

        const cx = (x + width / 2) * ppu
        const cy = (y + depth / 2) * ppu
        const w = width * ppu
        const h = depth * ppu

        return (
          <Fragment key={f.id}>
            <Rect
              x={cx}
              y={cy}
              width={w}
              height={h}
              offsetX={w / 2}
              offsetY={h / 2}
              rotation={rotation}
              fill={f.fillColor}
              stroke="#00000055"
              strokeWidth={1}
            />
            {f.label && (
              <Text
                x={cx}
                y={cy}
                text={f.label}
                align="center"
                verticalAlign="middle"
                offsetX={w / 2}
                offsetY={h / 2}
                width={w}
                height={h}
                fill="#1a1a1a"
                fontSize={12}
                rotation={rotation}
                listening={false}
              />
            )}
          </Fragment>
        )
      })}
    </Layer>
  )
}

