import { Fragment } from 'react'
import { Layer, Rect, Text } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'
import { useUIStore } from '../../store/uiStore'

interface Props {
  pixelsPerUnit: number
}

export function FurnitureLayer({ pixelsPerUnit: ppu }: Props) {
  const instances = useProjectStore((s) => s.project.furnitureInstances)
  const dragState = useUIStore((s) => s.dragState)

  return (
    <Layer>
      {instances.filter((f) => f.visible).map((f) => {
        // Live-preview values while this instance is being moved/resized/
        // rotated: the store isn't mutated until pointer-up.
        let x = f.x
        let y = f.y
        let width = f.width
        let depth = f.depth
        let rotation = f.rotation
        if (dragState?.kind === 'furnitureMove' && dragState.id === f.id) {
          x = dragState.currentX
          y = dragState.currentY
        } else if (dragState?.kind === 'furnitureResize' && dragState.id === f.id) {
          x = dragState.currentX
          y = dragState.currentY
          width = dragState.currentWidth
          depth = dragState.currentDepth
        } else if (dragState?.kind === 'furnitureRotate' && dragState.id === f.id) {
          rotation = dragState.currentRotation
        }

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

