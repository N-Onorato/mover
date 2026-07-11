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
const DOUBLE_CLICK_MS = 300

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

type Mode = 'idle' | 'marquee' | 'wall' | 'vertex' | 'room'

// LayoutCanvas's onMouseUp handler calls onPointerUp({x:0,y:0}, ppu) - it does
// not forward the real pointer position. We track the last live position from
// onPointerMove ourselves so onPointerUp can use the true final point.
let mode: Mode = 'idle'
let lastWorldPt: Point | null = null
let dragAnchorWorld: Point | null = null // wall/room drag: click point at drag start

// E3b: double-click-on-wall vertex insertion. Mirrors RoomTool's
// lastClickMs pattern - track the last edge that was clicked so a second
// click within the double-click window on the *same* edge inserts a vertex
// instead of starting another wall drag.
let lastClickMs = 0
let lastClickEdge: { roomId: string; edgeIndex: number } | null = null

/** E1: hit-test corridor scales with the room's rendered wall thickness so
 * the clickable area tracks what's actually drawn on screen at any zoom. */
function wallThresholdWorld(basePx: number, wallThicknessWorld: number, ppu: number): number {
  return Math.max(basePx, (wallThicknessWorld * ppu) / 2) / ppu
}

export const SelectTool: ToolHandlers = {
  onPointerDown(worldPt: Point, ppu: number) {
    mode = 'idle'
    lastWorldPt = worldPt
    dragAnchorWorld = null

    const { rooms } = useProjectStore.getState().project
    const {
      lockedLayers,
      selectedIds,
      setSelection,
      setSelectedWall,
      clearSelection,
      setDragState,
      setMarquee,
    } = useUIStore.getState()

    if (!lockedLayers.rooms) {
      // 1. Vertex hit test takes priority over edge hit test (vertices sit on
      // edges' endpoints).
      for (let ri = rooms.length - 1; ri >= 0; ri--) {
        const room = rooms[ri]
        if (!room.visible || room.locked) continue
        const pts = room.points
        const vertexThresholdWorld = wallThresholdWorld(VERTEX_HIT_THRESHOLD_PX, room.wallThickness, ppu)
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
            lastClickEdge = null
            return
          }
        }
      }

      // 2. Edge (wall) hit test - single-select / wall-select behavior,
      // starts a wall drag, or (E3b) inserts a vertex on double-click.
      for (let ri = rooms.length - 1; ri >= 0; ri--) {
        const room = rooms[ri]
        if (!room.visible || room.locked) continue
        const pts = room.points
        const thresholdWorld = wallThresholdWorld(WALL_HIT_THRESHOLD_PX, room.wallThickness, ppu)
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i]
          const b = pts[(i + 1) % pts.length]
          if (distanceToSegment(worldPt, a, b) <= thresholdWorld) {
            const now = Date.now()
            const isDoubleClick =
              now - lastClickMs < DOUBLE_CLICK_MS &&
              lastClickEdge !== null &&
              lastClickEdge.roomId === room.id &&
              lastClickEdge.edgeIndex === i

            if (isDoubleClick) {
              lastClickMs = 0
              lastClickEdge = null
              const { project } = useProjectStore.getState()
              useHistoryStore.getState().pushSnapshot(project)
              const nextPoints = pts.slice()
              nextPoints.splice(i + 1, 0, worldPt)
              useProjectStore.getState().updateRoom(room.id, { points: nextPoints })
              setSelection([room.id])
              setSelectedWall(null)
              mode = 'idle'
              return
            }

            lastClickMs = now
            lastClickEdge = { roomId: room.id, edgeIndex: i }

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

      // 3. Room body hit test - select and (E5) begin a room drag. If the
      // clicked room is part of an existing multi-selection, drag every
      // selected room together, preserving relative positions.
      for (let ri = rooms.length - 1; ri >= 0; ri--) {
        const room = rooms[ri]
        if (!room.visible || room.locked) continue
        if (pointInPolygon(worldPt, room.points)) {
          const isMultiSelected = selectedIds.length > 1 && selectedIds.includes(room.id)
          const roomIds = isMultiSelected
            ? selectedIds.filter((id) => {
                const r = rooms.find((rr) => rr.id === id)
                return !!r && r.visible && !r.locked
              })
            : [room.id]

          if (!isMultiSelected) {
            setSelection([room.id])
          }
          setSelectedWall(null)

          const originalPointsById: Record<string, Point[]> = {}
          const currentPointsById: Record<string, Point[]> = {}
          for (const id of roomIds) {
            const r = rooms.find((rr) => rr.id === id)
            if (!r) continue
            originalPointsById[id] = r.points
            currentPointsById[id] = r.points
          }

          setDragState({ kind: 'room', roomIds, originalPointsById, currentPointsById })
          mode = 'room'
          dragAnchorWorld = worldPt
          lastClickEdge = null
          return
        }
      }

      // 4. Nothing hit: begin a marquee drag. Whether this ends up being a
      // plain click (deselect) or an actual drag (box-select) is resolved on
      // pointer-up, once we know the total drag distance.
      lastClickEdge = null
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

    if (mode === 'room' && dragState?.kind === 'room' && dragAnchorWorld) {
      const dx = worldPt.x - dragAnchorWorld.x
      const dy = worldPt.y - dragAnchorWorld.y
      const nextById: Record<string, Point[]> = {}
      for (const id of dragState.roomIds) {
        const orig = dragState.originalPointsById[id]
        if (!orig) continue
        nextById[id] = orig.map((p) => ({ x: p.x + dx, y: p.y + dy }))
      }
      setDragState({ ...dragState, currentPointsById: nextById })
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

    if ((mode === 'wall' || mode === 'vertex') && dragState && (dragState.kind === 'wall' || dragState.kind === 'vertex')) {
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

    if (mode === 'room' && dragState?.kind === 'room') {
      const { project } = useProjectStore.getState()
      let moved = false
      for (const id of dragState.roomIds) {
        const room = project.rooms.find((r) => r.id === id)
        const nextPoints = dragState.currentPointsById[id]
        if (room && nextPoints && JSON.stringify(room.points) !== JSON.stringify(nextPoints)) {
          moved = true
          break
        }
      }
      if (moved) {
        useHistoryStore.getState().pushSnapshot(project)
        for (const id of dragState.roomIds) {
          const nextPoints = dragState.currentPointsById[id]
          if (nextPoints) useProjectStore.getState().updateRoom(id, { points: nextPoints })
        }
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
