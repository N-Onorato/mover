import type { Point } from '../../types/project'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { distanceToSegment, pointInPolygon } from '../../utils/geometry'

export interface ToolHandlers {
  onPointerDown(worldPt: Point, pixelsPerUnit: number): void
  onPointerMove(worldPt: Point, pixelsPerUnit: number): void
  onPointerUp(worldPt: Point, pixelsPerUnit: number): void
  onKeyDown(e: KeyboardEvent): void
  onRightClick(): void
}

const WALL_HIT_THRESHOLD_PX = 8

export const SelectTool: ToolHandlers = {
  onPointerDown(worldPt: Point, ppu: number) {
    const { rooms } = useProjectStore.getState().project
    const { lockedLayers, setSelection, setSelectedWall, clearSelection } = useUIStore.getState()
    const thresholdWorld = WALL_HIT_THRESHOLD_PX / ppu

    if (!lockedLayers.rooms) {
      for (let ri = rooms.length - 1; ri >= 0; ri--) {
        const room = rooms[ri]
        if (!room.visible || room.locked) continue
        const pts = room.points
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i]
          const b = pts[(i + 1) % pts.length]
          if (distanceToSegment(worldPt, a, b) <= thresholdWorld) {
            setSelection([room.id])
            setSelectedWall({ roomId: room.id, edgeIndex: i })
            return
          }
        }
      }
      for (let ri = rooms.length - 1; ri >= 0; ri--) {
        const room = rooms[ri]
        if (!room.visible || room.locked) continue
        if (pointInPolygon(worldPt, room.points)) {
          setSelection([room.id])
          setSelectedWall(null)
          return
        }
      }
    }

    clearSelection()
  },
  onPointerMove(_worldPt, _ppu) {},
  onPointerUp(_worldPt, _ppu) {},
  onKeyDown(_e) {},
  onRightClick() {},
}
