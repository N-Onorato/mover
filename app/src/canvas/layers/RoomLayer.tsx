import { Fragment } from 'react'
import { Layer, Line, Text } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'
import { useUIStore } from '../../store/uiStore'
import { polygonBoundingBox } from '../../utils/geometry'
import { WallLengthLabel } from '../WallLengthLabel'
import type { Point, Room } from '../../types/project'
import type { UnitSystem } from '../../utils/units'

interface Props {
  pixelsPerUnit: number
}

export function RoomLayer({ pixelsPerUnit }: Props) {
  const rooms = useProjectStore((s) => s.project.rooms)
  const units = useProjectStore((s) => s.project.settings.units)
  const showWallLabels = useUIStore((s) => s.showWallLabels)
  const showLayer = useUIStore((s) => s.showLayers.rooms)

  if (!showLayer) return <Layer />

  return (
    <Layer>
      {rooms
        .filter((r) => r.visible)
        .map((room) => (
          <RoomShape
            key={room.id}
            room={room}
            pixelsPerUnit={pixelsPerUnit}
            units={units}
            showWallLabels={showWallLabels}
          />
        ))}
    </Layer>
  )
}

interface RoomShapeProps {
  room: Room
  pixelsPerUnit: number
  units: UnitSystem
  showWallLabels: boolean
}

/** F1: each room subscribes only to the slice of dragState relevant to
 * *this* room, so a wall/vertex/multi drag re-renders and recomputes
 * flatPoints/bounding-box/label geometry only for the room(s) actually being
 * dragged - not every room in the project. Rooms not involved in the drag see
 * the same primitive (0, 0, null) on every pointer-move and never re-render. */
function RoomShape({ room, pixelsPerUnit, units, showWallLabels }: RoomShapeProps) {
  // C2/E5: while this room's wall/vertex is being dragged, render the live
  // preview points instead of the committed room.points. The store isn't
  // mutated until pointer-up.
  const wallVertexPoints = useUIStore((s) =>
    (s.dragState?.kind === 'wall' || s.dragState?.kind === 'vertex') && s.dragState.roomId === room.id
      ? s.dragState.currentPoints
      : null,
  )
  const dx = useUIStore((s) =>
    s.dragState?.kind === 'multi' && s.dragState.roomIds.includes(room.id) ? s.dragState.dx : 0,
  )
  const dy = useUIStore((s) =>
    s.dragState?.kind === 'multi' && s.dragState.roomIds.includes(room.id) ? s.dragState.dy : 0,
  )

  const effectivePoints: Point[] = wallVertexPoints
    ? wallVertexPoints
    : dx !== 0 || dy !== 0
      ? room.points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
      : room.points

  const flatPoints = effectivePoints.flatMap((p) => [p.x * pixelsPerUnit, p.y * pixelsPerUnit])
  const bb = polygonBoundingBox(effectivePoints)
  const cx = (bb.x + bb.width / 2) * pixelsPerUnit
  const cy = (bb.y + bb.height / 2) * pixelsPerUnit

  return (
    <Fragment>
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
}
