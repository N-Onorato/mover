import type { FurnitureInstance, Point } from '../../types/project'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { useHistoryStore } from '../../store/historyStore'
import {
  angle,
  distance,
  distanceToSegment,
  pointInPolygon,
  pointsEqual,
  rectPoints,
  rotatePoint,
} from '../../utils/geometry'
import { isDoubleClick } from '../../utils/doubleClick'
import { isCoarsePointer } from '../../utils/pointer'
import { wallThresholdWorld } from '../../utils/wallThreshold'
import { MIN_FURNITURE_SIZE } from '../../furniture/catalog'

/** Keyboard modifiers active for a pointer event, forwarded by LayoutCanvas
 * from the native MouseEvent so tools don't need their own window listeners. */
export interface PointerModifiers {
  shift: boolean
  ctrl: boolean
}

export interface ToolHandlers {
  onPointerDown(worldPt: Point, pixelsPerUnit: number, modifiers: PointerModifiers): void
  onPointerMove(worldPt: Point, pixelsPerUnit: number, modifiers: PointerModifiers): void
  onPointerUp(worldPt: Point, pixelsPerUnit: number, modifiers: PointerModifiers): void
  onKeyDown(e: KeyboardEvent): void
  onRightClick(): void
  /** Whether this tool wants raw (unsnapped) pointer coordinates instead of
   * grid-snapped ones. Defaults to false (snapped) when omitted. */
  wantsRawPointer?(): boolean
  /** Called when a pointer-down already dispatched to this tool turns out to
   * be the start of a multi-touch gesture (pinch/pan) or is cancelled by the
   * browser. The tool should discard whatever that stray pointer-down
   * started, without committing anything. */
  onGestureCancel?(): void
}

// Hit-test thresholds are wider on touch devices - a fingertip can't land
// within a few pixels the way a mouse cursor can.
export const WALL_HIT_THRESHOLD_PX = isCoarsePointer ? 14 : 8
export const VERTEX_HIT_THRESHOLD_PX = isCoarsePointer ? 16 : 9
const MARQUEE_MIN_DRAG_PX = 4

export const FURNITURE_HANDLE_HIT_THRESHOLD_PX = isCoarsePointer ? 16 : 9
export const FURNITURE_ROTATE_HANDLE_HIT_THRESHOLD_PX = isCoarsePointer ? 18 : 10
export const FURNITURE_ROTATE_HANDLE_OFFSET_PX = 24

/** Center of a furniture instance's unrotated box - the pivot both rendering
 * and hit-testing rotate around. */
export function furnitureCenter(f: Pick<FurnitureInstance, 'x' | 'y' | 'width' | 'depth'>): Point {
  return { x: f.x + f.width / 2, y: f.y + f.depth / 2 }
}

/** The 4 rotated corners of a furniture instance, in rectPoints order
 * (TL, TR, BR, BL) before rotation is applied. */
export function furnitureCorners(f: FurnitureInstance): Point[] {
  const center = furnitureCenter(f)
  return rectPoints(f.x, f.y, f.width, f.depth).map((p) => rotatePoint(p, center, f.rotation))
}

/** The rotate handle's world position: a fixed pixel offset above the
 * instance's top-mid edge, then rotated with the instance. */
export function furnitureRotateHandle(f: FurnitureInstance, ppu: number): Point {
  const center = furnitureCenter(f)
  const local: Point = { x: f.x + f.width / 2, y: f.y - FURNITURE_ROTATE_HANDLE_OFFSET_PX / ppu }
  return rotatePoint(local, center, f.rotation)
}

// E3b: double-click-on-wall vertex insertion. Track the last edge that was
// clicked so a second click within the double-click window on the *same*
// edge inserts a vertex instead of starting another wall drag.
let lastClickMs = 0
let lastClickEdge: { roomId: string; edgeIndex: number } | null = null

export const SelectTool: ToolHandlers = {
  onPointerDown(worldPt: Point, ppu: number, modifiers: PointerModifiers) {
    const { setInteractionMode, setDragAnchorWorld } = useUIStore.getState()
    setInteractionMode('idle')
    setDragAnchorWorld(null)

    const { rooms, interiorWalls, furnitureInstances } = useProjectStore.getState().project
    const {
      lockedLayers,
      selectedIds,
      setSelection,
      setSelectedWall,
      setSelectedInteriorWall,
      clearSelection,
      setDragState,
      setMarquee,
    } = useUIStore.getState()

    // 0. Furniture handle hit test - only relevant while exactly one
    // furniture instance is selected. Runs before every other hit test so
    // handles stay grabbable even where they overlap a room edge/vertex.
    if (!lockedLayers.furniture && selectedIds.length === 1) {
      const selectedFurniture = furnitureInstances.find((f) => f.id === selectedIds[0])
      if (selectedFurniture && selectedFurniture.visible && !selectedFurniture.locked) {
        const rotateHandle = furnitureRotateHandle(selectedFurniture, ppu)
        if (distance(worldPt, rotateHandle) <= FURNITURE_ROTATE_HANDLE_HIT_THRESHOLD_PX / ppu) {
          setDragState({
            kind: 'furnitureRotate',
            id: selectedFurniture.id,
            center: furnitureCenter(selectedFurniture),
            originalRotation: selectedFurniture.rotation,
            currentRotation: selectedFurniture.rotation,
          })
          setInteractionMode('furnitureRotate')
          lastClickEdge = null
          return
        }

        const corners = furnitureCorners(selectedFurniture)
        for (let ci = 0; ci < corners.length; ci++) {
          if (distance(worldPt, corners[ci]) <= FURNITURE_HANDLE_HIT_THRESHOLD_PX / ppu) {
            setDragState({
              kind: 'furnitureResize',
              id: selectedFurniture.id,
              corner: ci as 0 | 1 | 2 | 3,
              rotation: selectedFurniture.rotation,
              originalX: selectedFurniture.x,
              originalY: selectedFurniture.y,
              originalWidth: selectedFurniture.width,
              originalDepth: selectedFurniture.depth,
              currentX: selectedFurniture.x,
              currentY: selectedFurniture.y,
              currentWidth: selectedFurniture.width,
              currentDepth: selectedFurniture.depth,
            })
            setInteractionMode('furnitureResize')
            lastClickEdge = null
            return
          }
        }
      }
    }

    // 0b. Furniture body hit test - select and begin a move drag. Gated
    // independently by lockedLayers.furniture (not lockedLayers.rooms), and
    // runs before every room/wall test since FurnitureLayer renders on top
    // of rooms/walls visually - clicking furniture should select it, not
    // whatever room sits underneath.
    if (!lockedLayers.furniture) {
      for (let fi = furnitureInstances.length - 1; fi >= 0; fi--) {
        const f = furnitureInstances[fi]
        if (!f.visible || f.locked) continue
        const center = furnitureCenter(f)
        const localPt = rotatePoint(worldPt, center, -f.rotation)
        if (
          localPt.x >= f.x &&
          localPt.x <= f.x + f.width &&
          localPt.y >= f.y &&
          localPt.y <= f.y + f.depth
        ) {
          setSelection([f.id])
          setSelectedWall(null)
          setSelectedInteriorWall(null)
          setDragState({
            kind: 'furnitureMove',
            id: f.id,
            originalX: f.x,
            originalY: f.y,
            currentX: f.x,
            currentY: f.y,
          })
          setInteractionMode('furnitureMove')
          setDragAnchorWorld(worldPt)
          lastClickEdge = null
          return
        }
      }
    }

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
            setInteractionMode('vertex')
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
            const doubleClicked =
              isDoubleClick(lastClickMs, now) &&
              lastClickEdge !== null &&
              lastClickEdge.roomId === room.id &&
              lastClickEdge.edgeIndex === i

            if (doubleClicked) {
              lastClickMs = 0
              lastClickEdge = null
              const { project } = useProjectStore.getState()
              useHistoryStore.getState().pushSnapshot(project)
              const nextPoints = pts.slice()
              nextPoints.splice(i + 1, 0, worldPt)
              useProjectStore.getState().updateRoom(room.id, { points: nextPoints })
              setSelection([room.id])
              setSelectedWall(null)
              setInteractionMode('idle')
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
            setInteractionMode('wall')
            setDragAnchorWorld(worldPt)
            return
          }
        }
      }

      // 3. Interior wall endpoint hit test (E3) - begin an endpoint drag.
      // Runs after perimeter vertex/edge tests so the outer shell takes
      // priority over interior walls.
      for (let wi = interiorWalls.length - 1; wi >= 0; wi--) {
        const wall = interiorWalls[wi]
        const parentRoom = rooms.find((r) => r.id === wall.roomId)
        if (!parentRoom || !parentRoom.visible || parentRoom.locked) continue
        const vertexThresholdWorld = wallThresholdWorld(VERTEX_HIT_THRESHOLD_PX, wall.thickness, ppu)
        const which: 'a' | 'b' | null =
          distance(worldPt, wall.a) <= vertexThresholdWorld
            ? 'a'
            : distance(worldPt, wall.b) <= vertexThresholdWorld
              ? 'b'
              : null
        if (which) {
          setSelection([])
          setSelectedWall(null)
          setSelectedInteriorWall({ wallId: wall.id })
          setDragState({
            kind: 'interiorWallEndpoint',
            wallId: wall.id,
            which,
            originalA: wall.a,
            originalB: wall.b,
            currentA: wall.a,
            currentB: wall.b,
          })
          setInteractionMode('interiorWallEndpoint')
          lastClickEdge = null
          return
        }
      }

      // 4. Interior wall body hit test (E3) - select and begin a whole-wall
      // drag.
      for (let wi = interiorWalls.length - 1; wi >= 0; wi--) {
        const wall = interiorWalls[wi]
        const parentRoom = rooms.find((r) => r.id === wall.roomId)
        if (!parentRoom || !parentRoom.visible || parentRoom.locked) continue
        const thresholdWorld = wallThresholdWorld(WALL_HIT_THRESHOLD_PX, wall.thickness, ppu)
        if (distanceToSegment(worldPt, wall.a, wall.b) <= thresholdWorld) {
          setSelection([])
          setSelectedWall(null)
          setSelectedInteriorWall({ wallId: wall.id })
          setDragState({
            kind: 'interiorWallBody',
            wallId: wall.id,
            originalA: wall.a,
            originalB: wall.b,
            currentA: wall.a,
            currentB: wall.b,
          })
          setInteractionMode('interiorWallBody')
          setDragAnchorWorld(worldPt)
          lastClickEdge = null
          return
        }
      }

      // 5. Room body hit test - select and (E5) begin a room drag. If the
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
          setInteractionMode('room')
          setDragAnchorWorld(worldPt)
          lastClickEdge = null
          return
        }
      }

      // 6. Nothing hit: begin a marquee drag. Whether this ends up being a
      // plain click (deselect) or an actual drag (box-select) is resolved on
      // pointer-up, once we know the total drag distance.
      lastClickEdge = null
      setInteractionMode('marquee')
      setMarquee({ start: worldPt, end: worldPt, additive: modifiers.shift })
      return
    }

    clearSelection()
  },

  onPointerMove(worldPt: Point, _ppu: number, modifiers: PointerModifiers) {
    const { dragState, setDragState, marquee, setMarquee, interactionMode: mode, dragAnchorWorld } =
      useUIStore.getState()

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

    // E3: interior wall endpoint drag is a free move (no re-snap while
    // dragging - snapping only happens at initial placement).
    if (mode === 'interiorWallEndpoint' && dragState?.kind === 'interiorWallEndpoint') {
      if (dragState.which === 'a') {
        setDragState({ ...dragState, currentA: worldPt })
      } else {
        setDragState({ ...dragState, currentB: worldPt })
      }
      return
    }

    if (mode === 'interiorWallBody' && dragState?.kind === 'interiorWallBody' && dragAnchorWorld) {
      const dx = worldPt.x - dragAnchorWorld.x
      const dy = worldPt.y - dragAnchorWorld.y
      setDragState({
        ...dragState,
        currentA: { x: dragState.originalA.x + dx, y: dragState.originalA.y + dy },
        currentB: { x: dragState.originalB.x + dx, y: dragState.originalB.y + dy },
      })
      return
    }

    if (mode === 'furnitureMove' && dragState?.kind === 'furnitureMove' && dragAnchorWorld) {
      const dx = worldPt.x - dragAnchorWorld.x
      const dy = worldPt.y - dragAnchorWorld.y
      setDragState({
        ...dragState,
        currentX: dragState.originalX + dx,
        currentY: dragState.originalY + dy,
      })
      return
    }

    if (mode === 'furnitureResize' && dragState?.kind === 'furnitureResize') {
      // Resize along the box's own rotated axes, keeping the corner opposite
      // the dragged one fixed in world space. Working in a fixed unrotated
      // local frame (as a plain "unrotate the pointer, do axis-aligned math"
      // approach would) breaks here: x/y/width/depth define the box's
      // *unrotated* extent, but rendering always rotates around the
      // *current* center (recomputed as x+w/2, y+h/2 every frame) - and that
      // center shifts as width/depth change mid-drag. So instead the anchor
      // corner's fixed world position is computed once up front, and the
      // drag is resolved by projecting the pointer onto the box's rotated
      // u/v axes relative to that fixed anchor.
      const rad = dragState.rotation * (Math.PI / 180)
      const u = { x: Math.cos(rad), y: Math.sin(rad) } // box's local +x axis in world space
      const v = { x: -Math.sin(rad), y: Math.cos(rad) } // box's local +y axis in world space

      const origCenter = {
        x: dragState.originalX + dragState.originalWidth / 2,
        y: dragState.originalY + dragState.originalDepth / 2,
      }
      // rectPoints/corner order is TL,TR,BR,BL -> signs along (u,v) from center.
      const CORNER_SIGNS: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]
      const [dsx, dsy] = CORNER_SIGNS[dragState.corner]
      const asx = -dsx
      const asy = -dsy
      const halfW0 = dragState.originalWidth / 2
      const halfH0 = dragState.originalDepth / 2

      const anchorWorld = {
        x: origCenter.x + asx * halfW0 * u.x + asy * halfH0 * v.x,
        y: origCenter.y + asx * halfW0 * u.y + asy * halfH0 * v.y,
      }

      const diff = { x: worldPt.x - anchorWorld.x, y: worldPt.y - anchorWorld.y }
      const alongU = diff.x * u.x + diff.y * u.y
      const alongV = diff.x * v.x + diff.y * v.y

      const newWidth = Math.max(MIN_FURNITURE_SIZE, Math.abs(alongU))
      const newDepth = Math.max(MIN_FURNITURE_SIZE, Math.abs(alongV))

      const newCenter = {
        x: anchorWorld.x - asx * (newWidth / 2) * u.x - asy * (newDepth / 2) * v.x,
        y: anchorWorld.y - asx * (newWidth / 2) * u.y - asy * (newDepth / 2) * v.y,
      }

      setDragState({
        ...dragState,
        currentX: newCenter.x - newWidth / 2,
        currentY: newCenter.y - newDepth / 2,
        currentWidth: newWidth,
        currentDepth: newDepth,
      })
      return
    }

    if (mode === 'furnitureRotate' && dragState?.kind === 'furnitureRotate') {
      const rawAngle = angle(dragState.center, worldPt) + 90
      let currentRotation = ((rawAngle % 360) + 360) % 360
      const { settings } = useProjectStore.getState().project
      const effectiveSnap = modifiers.ctrl ? !settings.snapToGrid : settings.snapToGrid
      if (effectiveSnap) {
        currentRotation = (Math.round(currentRotation / 45) * 45) % 360
      }
      setDragState({ ...dragState, currentRotation })
      return
    }
  },

  onPointerUp(worldPt: Point, ppu: number) {
    const {
      dragState,
      setDragState,
      marquee,
      setMarquee,
      selectedIds,
      setSelection,
      clearSelection,
      interactionMode: mode,
      setInteractionMode,
      setDragAnchorWorld,
    } = useUIStore.getState()
    const endPt = worldPt

    if (mode === 'marquee' && marquee && endPt) {
      const movedWorld = distance(marquee.start, marquee.end)
      const { rooms } = useProjectStore.getState().project
      const minX = Math.min(marquee.start.x, marquee.end.x)
      const maxX = Math.max(marquee.start.x, marquee.end.x)
      const minY = Math.min(marquee.start.y, marquee.end.y)
      const maxY = Math.max(marquee.start.y, marquee.end.y)

      const wasDrag = movedWorld * ppu >= MARQUEE_MIN_DRAG_PX

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
      setInteractionMode('idle')
      return
    }

    if ((mode === 'wall' || mode === 'vertex') && dragState && (dragState.kind === 'wall' || dragState.kind === 'vertex')) {
      const { project } = useProjectStore.getState()
      const room = project.rooms.find((r) => r.id === dragState.roomId)
      const moved = room ? !pointsEqual(room.points, dragState.currentPoints) : false
      if (room && moved) {
        useHistoryStore.getState().pushSnapshot(project)
        useProjectStore.getState().updateRoom(room.id, { points: dragState.currentPoints })
      }
      setDragState(null)
      setInteractionMode('idle')
      setDragAnchorWorld(null)
      return
    }

    if (mode === 'room' && dragState?.kind === 'room') {
      const { project } = useProjectStore.getState()
      let moved = false
      for (const id of dragState.roomIds) {
        const room = project.rooms.find((r) => r.id === id)
        const nextPoints = dragState.currentPointsById[id]
        if (room && nextPoints && !pointsEqual(room.points, nextPoints)) {
          moved = true
          break
        }
      }
      if (moved) {
        useHistoryStore.getState().pushSnapshot(project)
        for (const id of dragState.roomIds) {
          const room = project.rooms.find((r) => r.id === id)
          const originalPoints = dragState.originalPointsById[id]
          const nextPoints = dragState.currentPointsById[id]
          if (!room || !originalPoints || !nextPoints) continue
          useProjectStore.getState().updateRoom(id, { points: nextPoints })
          // E3/E5: whole-room drag translates every point of the room by the
          // same delta, so interior walls (anchored or free-floating) move
          // with it too. Derive the delta from the first point since a
          // uniform room translation moves every point identically.
          const dx = nextPoints[0].x - originalPoints[0].x
          const dy = nextPoints[0].y - originalPoints[0].y
          if (dx !== 0 || dy !== 0) {
            for (const wall of project.interiorWalls) {
              if (wall.roomId !== id) continue
              useProjectStore.getState().updateInteriorWall(wall.id, {
                a: { x: wall.a.x + dx, y: wall.a.y + dy },
                b: { x: wall.b.x + dx, y: wall.b.y + dy },
              })
            }
          }
        }
      }
      setDragState(null)
      setInteractionMode('idle')
      setDragAnchorWorld(null)
      return
    }

    if (mode === 'interiorWallEndpoint' && dragState?.kind === 'interiorWallEndpoint') {
      const { project } = useProjectStore.getState()
      const wall = project.interiorWalls.find((w) => w.id === dragState.wallId)
      const moved = wall
        ? !pointsEqual([wall.a, wall.b], [dragState.currentA, dragState.currentB])
        : false
      if (wall && moved) {
        useHistoryStore.getState().pushSnapshot(project)
        useProjectStore
          .getState()
          .updateInteriorWall(wall.id, { a: dragState.currentA, b: dragState.currentB })
      }
      setDragState(null)
      setInteractionMode('idle')
      setDragAnchorWorld(null)
      return
    }

    if (mode === 'interiorWallBody' && dragState?.kind === 'interiorWallBody') {
      const { project } = useProjectStore.getState()
      const wall = project.interiorWalls.find((w) => w.id === dragState.wallId)
      const moved = wall
        ? !pointsEqual([wall.a, wall.b], [dragState.currentA, dragState.currentB])
        : false
      if (wall && moved) {
        useHistoryStore.getState().pushSnapshot(project)
        useProjectStore
          .getState()
          .updateInteriorWall(wall.id, { a: dragState.currentA, b: dragState.currentB })
      }
      setDragState(null)
      setInteractionMode('idle')
      setDragAnchorWorld(null)
      return
    }

    if (mode === 'furnitureMove' && dragState?.kind === 'furnitureMove') {
      const { project } = useProjectStore.getState()
      const f = project.furnitureInstances.find((ff) => ff.id === dragState.id)
      const moved = f ? f.x !== dragState.currentX || f.y !== dragState.currentY : false
      if (f && moved) {
        useHistoryStore.getState().pushSnapshot(project)
        useProjectStore.getState().updateFurniture(f.id, { x: dragState.currentX, y: dragState.currentY })
      }
      setDragState(null)
      setInteractionMode('idle')
      setDragAnchorWorld(null)
      return
    }

    if (mode === 'furnitureResize' && dragState?.kind === 'furnitureResize') {
      const { project } = useProjectStore.getState()
      const f = project.furnitureInstances.find((ff) => ff.id === dragState.id)
      const moved = f
        ? f.x !== dragState.currentX ||
          f.y !== dragState.currentY ||
          f.width !== dragState.currentWidth ||
          f.depth !== dragState.currentDepth
        : false
      if (f && moved) {
        useHistoryStore.getState().pushSnapshot(project)
        useProjectStore.getState().updateFurniture(f.id, {
          x: dragState.currentX,
          y: dragState.currentY,
          width: dragState.currentWidth,
          depth: dragState.currentDepth,
        })
      }
      setDragState(null)
      setInteractionMode('idle')
      setDragAnchorWorld(null)
      return
    }

    if (mode === 'furnitureRotate' && dragState?.kind === 'furnitureRotate') {
      const { project } = useProjectStore.getState()
      const f = project.furnitureInstances.find((ff) => ff.id === dragState.id)
      const moved = f ? f.rotation !== dragState.currentRotation : false
      if (f && moved) {
        useHistoryStore.getState().pushSnapshot(project)
        useProjectStore.getState().updateFurniture(f.id, { rotation: dragState.currentRotation })
      }
      setDragState(null)
      setInteractionMode('idle')
      setDragAnchorWorld(null)
      return
    }

    setInteractionMode('idle')
    setDragAnchorWorld(null)
  },

  onKeyDown(_e) {},
  onRightClick() {},

  // A pinch started mid-drag: drop the in-progress drag/marquee without
  // committing. Safe because every drag variant previews via dragState and
  // only writes to projectStore on pointer-up.
  onGestureCancel() {
    const { setDragState, setMarquee, setInteractionMode, setDragAnchorWorld } =
      useUIStore.getState()
    setDragState(null)
    setMarquee(null)
    setInteractionMode('idle')
    setDragAnchorWorld(null)
    lastClickEdge = null
  },

  // Furniture handles (resize corners, rotate handle) sit at precise,
  // non-grid-aligned world positions - a fixed pixel offset for the rotate
  // handle, arbitrary rotated corners for resize. If the incoming pointer
  // were grid-snapped, clicks would almost never land within the handles'
  // hit radius whenever snap-to-grid is on. So once exactly one furniture
  // instance is selected (handles visible), pointer coordinates are raw for
  // the rest of that interaction - hit-testing, and the ensuing
  // resize/rotate/move drag.
  wantsRawPointer() {
    const { selectedIds } = useUIStore.getState()
    if (selectedIds.length !== 1) return false
    const { furnitureInstances } = useProjectStore.getState().project
    return furnitureInstances.some((f) => f.id === selectedIds[0])
  },
}
