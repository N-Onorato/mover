import { Fragment } from 'react'
import { Layer, Line } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'
import { useUIStore } from '../../store/uiStore'
import { polygonBoundingBox } from '../../utils/geometry'
import { WallLengthLabel } from '../WallLengthLabel'
import type { Point } from '../../types/project'
import type { UnitSystem } from '../../utils/units'

interface Props {
  pixelsPerUnit: number
  units: UnitSystem
}

// E3: interior walls render as a flat top-level layer (not nested under
// RoomLayer's per-room loop) since they carry independent selection/drag
// state and aren't part of any room's point list.
export function InteriorWallLayer({ pixelsPerUnit: ppu, units }: Props) {
  const interiorWalls = useProjectStore((s) => s.project.interiorWalls)
  const rooms = useProjectStore((s) => s.project.rooms)
  const dragState = useUIStore((s) => s.dragState)
  const showWallLabels = useUIStore((s) => s.showWallLabels)
  // E3: no dedicated uiStore.showLayers key for interior walls — they're
  // room-scoped (already hidden per-wall when their parent room is hidden
  // below), so piggyback on the rooms layer toggle.
  const showLayer = useUIStore((s) => s.showLayers.rooms)

  if (!showLayer) return <Layer />

  return (
    <Layer>
      {interiorWalls.map((wall) => {
        const room = rooms.find((r) => r.id === wall.roomId)
        if (!room || !room.visible) return null

        let a: Point = wall.a
        let b: Point = wall.b
        if (dragState?.kind === 'interiorWallEndpoint' && dragState.wallId === wall.id) {
          a = dragState.currentA
          b = dragState.currentB
        } else if (dragState?.kind === 'multi' && dragState.currentWallById[wall.id]) {
          a = dragState.currentWallById[wall.id].a
          b = dragState.currentWallById[wall.id].b
        }

        const bb = polygonBoundingBox(room.points)
        const centroid: Point = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }

        return (
          <Fragment key={wall.id}>
            <Line
              points={[a.x * ppu, a.y * ppu, b.x * ppu, b.y * ppu]}
              stroke={room.wallColor}
              strokeWidth={wall.thickness * ppu}
              lineCap="round"
            />
            {showWallLabels && (
              <WallLengthLabel
                a={a}
                b={b}
                ppu={ppu}
                units={units}
                wallThicknessWorld={wall.thickness}
                interiorRef={centroid}
              />
            )}
          </Fragment>
        )
      })}
    </Layer>
  )
}
