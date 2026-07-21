import type { ToolHandlers } from './SelectTool'
import type { Point, Room } from '../../types/project'
import { useUIStore, cancelDrawingGesture } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { useHistoryStore } from '../../store/historyStore'
import { distance, closestPointOnSegment, pointInPolygon } from '../../utils/geometry'

const SNAP_THRESHOLD_PX = 10

/** E3: click 1 snaps to (in priority order) a perimeter vertex, an existing
 * interior wall's endpoint, a perimeter edge, or an existing interior wall's
 * body - exact junctions before projected/approximate points, since an exact
 * corner connection is structurally more meaningful than a mid-wall tee.
 * Falls through to the raw point when nothing is within threshold, which is
 * the valid free-floating case (peninsulas/pony walls). */
function snapPoint(worldPt: Point, room: Room, roomId: string, ppu: number): Point {
  const { interiorWalls } = useProjectStore.getState().project
  const wallsInRoom = interiorWalls.filter((w) => w.roomId === roomId)
  const thresholdWorld = SNAP_THRESHOLD_PX / ppu

  for (const v of room.points) {
    if (distance(worldPt, v) <= thresholdWorld) return v
  }

  for (const w of wallsInRoom) {
    if (distance(worldPt, w.a) <= thresholdWorld) return w.a
    if (distance(worldPt, w.b) <= thresholdWorld) return w.b
  }

  for (let i = 0; i < room.points.length; i++) {
    const a = room.points[i]
    const b = room.points[(i + 1) % room.points.length]
    const projected = closestPointOnSegment(worldPt, a, b)
    if (distance(worldPt, projected) <= thresholdWorld) return projected
  }

  for (const w of wallsInRoom) {
    const projected = closestPointOnSegment(worldPt, w.a, w.b)
    if (distance(worldPt, projected) <= thresholdWorld) return projected
  }

  return worldPt
}

function findContainingRoom(worldPt: Point): Room | null {
  const { rooms } = useProjectStore.getState().project
  for (let i = rooms.length - 1; i >= 0; i--) {
    const room = rooms[i]
    if (!room.visible || room.locked) continue
    if (pointInPolygon(worldPt, room.points)) return room
  }
  return null
}

function commitWall(roomId: string, a: Point, b: Point) {
  const { project } = useProjectStore.getState()
  useHistoryStore.getState().pushSnapshot(project)
  useProjectStore.getState().addInteriorWall({
    id: crypto.randomUUID(),
    roomId,
    a,
    b,
    thickness: project.settings.defaultWallThickness,
    locked: false,
    visible: true,
  })
  useUIStore.getState().setDrawingState(null)
}

// H1: named so onKeyDown and ToolHandlers.onCancel share one implementation.
function cancelInteriorWall() {
  useUIStore.getState().setDrawingState(null)
}

export const InteriorWallTool: ToolHandlers = {
  onPointerDown(worldPt: Point, _rawWorldPt: Point, ppu: number, _modifiers) {
    const { drawingState, setDrawingState } = useUIStore.getState()

    if (!drawingState || drawingState.kind !== 'interiorWall') {
      const room = findContainingRoom(worldPt)
      if (!room) return
      const snapped = snapPoint(worldPt, room, room.id, ppu)
      setDrawingState({ kind: 'interiorWall', roomId: room.id, a: snapped, cursor: snapped })
      return
    }

    const room = useProjectStore.getState().project.rooms.find((r) => r.id === drawingState.roomId)
    if (!room) {
      setDrawingState(null)
      return
    }
    const snapped = snapPoint(worldPt, room, drawingState.roomId, ppu)
    if (distance(snapped, drawingState.a) < 1e-6) return
    commitWall(drawingState.roomId, drawingState.a, snapped)
  },

  onPointerMove(worldPt: Point, ppu: number, _modifiers) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState || drawingState.kind !== 'interiorWall') return
    const room = useProjectStore.getState().project.rooms.find((r) => r.id === drawingState.roomId)
    const cursor = room ? snapPoint(worldPt, room, drawingState.roomId, ppu) : worldPt
    setDrawingState({ ...drawingState, cursor })
  },

  onPointerUp(_worldPt: Point, _ppu: number, _modifiers) {},

  onKeyDown(e: KeyboardEvent) {
    const drawingState = useUIStore.getState().drawingState
    if (!drawingState || drawingState.kind !== 'interiorWall') return
    if (e.key === 'Escape') cancelInteriorWall()
  },

  onCancel: cancelInteriorWall,

  onRightClick() {
    cancelInteriorWall()
  },

  // A pinch started right as the wall's first point was placed: drop the
  // in-progress wall. (If the stray pointer-down was the *second* click it
  // already committed the wall - drawingState is null by then and this is a
  // no-op; the committed wall stays undoable.) See H2/cancelDrawingGesture.
  onGestureCancel() {
    cancelDrawingGesture('interiorWall')
  },
}
