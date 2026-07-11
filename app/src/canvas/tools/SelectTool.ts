import type { Point } from '../../types/project'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { useHistoryStore } from '../../store/historyStore'
import { distance, distanceToSegment, pointInPolygon } from '../../utils/geometry'

export interface ToolHandlers {
  onPointerDown(worldPt: Point, pixelsPerUnit: number): void
  onPointerMove(worldPt: Point, pixelsPerUnit: number): void
  onPointerUp(worldPt: Point, pixelsPerUnit: number): void
  onKeyDown(e: KeyboardEvent): void
  onRightClick(): void
}

const WALL_HIT_THRESHOLD_PX = 8
const VERTEX_HIT_THRESHOLD_PX = 9
const MARQUEE_MIN_DRAG_PX = 4

// Track the Shift modifier ourselves: LayoutCanvas's pointer handlers don't
// forward keyboard modifier state to tools (onPointerDown/Move/Up only take
// worldPt + pixelsPerUnit), so we listen at module scope instead of touching
// LayoutCanvas.tsx (owned by another agent).
let shiftHeld = false
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') shiftHeld = true
  })
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') shiftHeld = false
  })
}

type Mode = 'idle' | 'marquee' | 'wall' | 'vertex'

// LayoutCanvas's onMouseUp handler calls onPointerUp({x:0,y:0}, ppu) - it does
// not forward the real pointer position. We track the last live position from
// onPointerMove ourselves so onPointerUp can use the true final point.
let mode: Mode = 'idle'
let lastWorldPt: Point | null = null
let dragAnchorWorld: Point | null = null // wall-drag: click point at drag start

export const SelectTool: ToolHandlers = {
  onPointerDown(worldPt: Point, ppu: number) {
    mode = 'idle'
    lastWorldPt = worldPt
    dragAnchorWorld = null

    const { rooms } = useProjectStore.getState().project
    const {
      lockedLayers,
      setSelection,
      setSelectedWall,
      clearSelection,
      setDragState,
      setMarquee,
    } = useUIStore.getState()
    const thresholdWorld = WALL_HIT_THRESHOLD_PX / ppu
    const vertexThresholdWorld = VERTEX_HIT_THRESHOLD_PX / ppu

    if (!lockedLayers.rooms) {
      // 1. Vertex hit test takes priority over edge hit test (vertices sit on
      // edges' endpoints).
      for (let ri = rooms.length - 1; ri >= 0; ri--) {
        const room = rooms[ri]
        if (!room.visible || room.locked) continue
        const pts = room.points
        for (let vi = 0; vi < pts.length; vi++) {
          if (distance(worldPt, pts[vi]) <= vertexThresholdWorld) {
            setSelection([room.id])
            setSelectedWall(null)
            setDragState({
              kind: 'vertex',
              roomId: room.id,
              vertexIndex: vi,
              originalPoints: pts,
              currentPoints: pts,
            })
            mode = 'vertex'
            return
          }
        }
      }

      // 2. Edge (wall) hit test - existing single-select / wall-select
      // behavior, now also starts a wall drag.
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
            setDragState({
              kind: 'wall',
              roomId: room.id,
              edgeIndex: i,
              originalPoints: pts,
              currentPoints: pts,
            })
            mode = 'wall'
            dragAnchorWorld = worldPt
            return
          }
        }
      }

      // 3. Room body hit test - plain select, no drag.
      for (let ri = rooms.length - 1; ri >= 0; ri--) {
        const room = rooms[ri]
        if (!room.visible || room.locked) continue
        if (pointInPolygon(worldPt, room.points)) {
          setSelection([room.id])
          setSelectedWall(null)
          return
        }
      }

      // 4. Nothing hit: begin a marquee drag. Whether this ends up being a
      // plain click (deselect) or an actual drag (box-select) is resolved on
      // pointer-up, once we know the total drag distance.
      mode = 'marquee'
      setMarquee({ start: worldPt, end: worldPt, additive: shiftHeld })
      return
    }

    clearSelection()
  },

  onPointerMove(worldPt: Point, _ppu: number) {
    lastWorldPt = worldPt
    const { dragState, setDragState, marquee, setMarquee } = useUIStore.getState()

    if (mode === 'marquee' && marquee) {
      setMarquee({ ...marquee, end: worldPt })
      return
    }

    if (mode === 'wall' && dragState?.kind === 'wall' && dragAnchorWorld) {
      const dx = worldPt.x - dragAnchorWorld.x
      const dy = worldPt.y - dragAnchorWorld.y
      const { originalPoints, edgeIndex } = dragState
      const next = originalPoints.slice()
      const i = edgeIndex
      const j = (edgeIndex + 1) % originalPoints.length
      next[i] = { x: originalPoints[i].x + dx, y: originalPoints[i].y + dy }
      next[j] = { x: originalPoints[j].x + dx, y: originalPoints[j].y + dy }
      setDragState({ ...dragState, currentPoints: next })
      return
    }

    if (mode === 'vertex' && dragState?.kind === 'vertex') {
      const next = dragState.originalPoints.slice()
      next[dragState.vertexIndex] = worldPt
      setDragState({ ...dragState, currentPoints: next })
      return
    }
  },

  onPointerUp(_worldPt: Point, _ppu: number) {
    const { dragState, setDragState, marquee, setMarquee, selectedIds, setSelection, clearSelection } =
      useUIStore.getState()
    const endPt = lastWorldPt

    if (mode === 'marquee' && marquee && endPt) {
      const movedWorld = distance(marquee.start, marquee.end)
      const { rooms } = useProjectStore.getState().project
      const minX = Math.min(marquee.start.x, marquee.end.x)
      const maxX = Math.max(marquee.start.x, marquee.end.x)
      const minY = Math.min(marquee.start.y, marquee.end.y)
      const maxY = Math.max(marquee.start.y, marquee.end.y)

      const wasDrag = movedWorld * _ppu >= MARQUEE_MIN_DRAG_PX

      if (!wasDrag) {
        // Plain click on empty space: preserve existing deselect behavior.
        if (!marquee.additive) clearSelection()
      } else {
        const { lockedLayers } = useUIStore.getState()
        const hitIds = lockedLayers.rooms
          ? []
          : rooms
              .filter((r) => r.visible && !r.locked)
              .filter((r) =>
                r.points.every((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY),
              )
              .map((r) => r.id)

        if (marquee.additive) {
          const merged = Array.from(new Set([...selectedIds, ...hitIds]))
          setSelection(merged)
        } else {
          setSelection(hitIds)
        }
      }

      setMarquee(null)
      mode = 'idle'
      lastWorldPt = null
      return
    }

    if ((mode === 'wall' || mode === 'vertex') && dragState) {
      const { project } = useProjectStore.getState()
      const room = project.rooms.find((r) => r.id === dragState.roomId)
      const moved = room ? JSON.stringify(room.points) !== JSON.stringify(dragState.currentPoints) : false
      if (room && moved) {
        useHistoryStore.getState().pushSnapshot(project)
        useProjectStore.getState().updateRoom(room.id, { points: dragState.currentPoints })
      }
      setDragState(null)
      mode = 'idle'
      dragAnchorWorld = null
      lastWorldPt = null
      return
    }

    mode = 'idle'
    dragAnchorWorld = null
    lastWorldPt = null
  },

  onKeyDown(_e) {},
  onRightClick() {},
}
