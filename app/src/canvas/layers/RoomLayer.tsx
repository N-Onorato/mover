import { Fragment } from 'react'
import { Layer, Line, Text } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'
import { useUIStore } from '../../store/uiStore'
import { polygonBoundingBox } from '../../utils/geometry'
import { WallLengthLabel } from '../WallLengthLabel'
import type { Point } from '../../types/project'

interface Props {
  pixelsPerUnit: number
}

export function RoomLayer({ pixelsPerUnit }: Props) {
  const rooms = useProjectStore((s) => s.project.rooms)
  const units = useProjectStore((s) => s.project.settings.units)
  const dragState = useUIStore((s) => s.dragState)
  const showWallLabels = useUIStore((s) => s.showWallLabels)
  const showLayer = useUIStore((s) => s.showLayers.rooms)

  if (!showLayer) return <Layer />

  return (
    <Layer>
      {rooms.filter((r) => r.visible).map((room) => {
        // C2/E5: while this room's wall/vertex/body is being dragged, render
        // the live preview points instead of the committed room.points. The
        // store isn't mutated until pointer-up. Room-body drags (E5) can
        // move multiple rooms at once, so they're keyed by room id instead
        // of a single roomId field.
        let effectivePoints: Point[] = room.points
        if (dragState) {
          if (dragState.kind === 'room') {
            effectivePoints = dragState.currentPointsById[room.id] ?? room.points
          } else if (
            (dragState.kind === 'wall' || dragState.kind === 'vertex') &&
            dragState.roomId === room.id
          ) {
            effectivePoints = dragState.currentPoints
          }
        }

        const flatPoints = effectivePoints.flatMap((p) => [p.x * pixelsPerUnit, p.y * pixelsPerUnit])
        const bb = polygonBoundingBox(effectivePoints)
        const cx = (bb.x + bb.width / 2) * pixelsPerUnit
        const cy = (bb.y + bb.height / 2) * pixelsPerUnit
        return (
          <Fragment key={room.id}>
            <Line
              points={flatPoints}
              closed
              fill={room.fillColor === 'transparent' ? undefined : room.fillColor}
              stroke={room.wallColor}
              strokeWidth={room.wallThickness * pixelsPerUnit}
            />
            {room.name && (
              <Text x={cx} y={cy} text={room.name} align="center" offsetX={40} offsetY={8} fill="#ddd" fontSize={13} />
            )}
            {/* D1/E4: per-wall length labels, toggleable via uiStore.showWallLabels.
                Offset outward from the room's centroid (bounding-box center),
                scaled by wall thickness + a fixed margin, so labels clear the
                rendered stroke instead of sitting on the centerline. */}
            {showWallLabels &&
              effectivePoints.map((a, i) => {
                const b = effectivePoints[(i + 1) % effectivePoints.length]
                const centroid: Point = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }
                return (
                  <WallLengthLabel
                    key={`wall-label-${i}`}
                    a={a}
                    b={b}
                    ppu={pixelsPerUnit}
                    units={units}
                    wallThicknessWorld={room.wallThickness}
                    interiorRef={centroid}
                  />
                )
              })}
          </Fragment>
        )
      })}
    </Layer>
  )
}
