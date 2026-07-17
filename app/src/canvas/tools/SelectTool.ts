import type { FurnitureInstance, Point, ReferenceImage } from '../../types/project'
import { useUIStore, type MultiDragState } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { useHistoryStore } from '../../store/historyStore'
import {
  angle,
  distance,
  distanceToSegment,
  pointInPolygon,
  pointInRotatedRect,
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
  /** rawWorldPt is the same pointer-down position as worldPt but never
   * grid-snapped, regardless of wantsRawPointer() - hit-testing should always
   * use it, since snapping the click location (rather than the eventual
   * placed/dragged position) has no upside for hit-testing precision. */
  onPointerDown(worldPt: Point, rawWorldPt: Point, pixelsPerUnit: number, modifiers: PointerModifiers): void
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

/** The 4 rotated corners of a reference image, mirroring furnitureCorners. */
export function imageCorners(img: Pick<ReferenceImage, 'x' | 'y' | 'width' | 'height' | 'rotation'>): Point[] {
  const center = { x: img.x + img.width / 2, y: img.y + img.height / 2 }
  return rectPoints(img.x, img.y, img.width, img.height).map((p) => rotatePoint(p, center, img.rotation))
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

/** Builds a MultiDragState snapshotting every room/furniture/interior-wall in
 * `selectedIds` (plus any interior wall anchored to a selected room),
 * filtered the same way each type's own hit test already filters
 * (invisible/locked entities, or those under a locked parent room, never
 * join a drag). This is the sole drag-construction path for all three body
 * hit tests below, whether `selectedIds` is the whole current selection (item
 * clicked was already part of a >1-item selection) or just the one clicked
 * item (nothing else selected). */
function buildMultiDragState(selectedIds: string[]): MultiDragState {
  const { rooms, interiorWalls, furnitureInstances } = useProjectStore.getState().project
  const selectedSet = new Set(selectedIds)
  const roomsById = new Map(rooms.map((r) => [r.id, r]))

  const roomIds: string[] = []
  const originalRoomPointsById: Record<string, Point[]> = {}
  const currentRoomPointsById: Record<string, Point[]> = {}
  for (const r of rooms) {
    if (!selectedSet.has(r.id) || !r.visible || r.locked) continue
    roomIds.push(r.id)
    originalRoomPointsById[r.id] = r.points
    currentRoomPointsById[r.id] = r.points
  }
  const roomIdSet = new Set(roomIds)

  const furnitureIds: string[] = []
  const originalFurniturePosById: Record<string, Point> = {}
  const currentFurniturePosById: Record<string, Point> = {}
  for (const f of furnitureInstances) {
    if (!selectedSet.has(f.id) || !f.visible || f.locked) continue
    furnitureIds.push(f.id)
    originalFurniturePosById[f.id] = { x: f.x, y: f.y }
    currentFurniturePosById[f.id] = { x: f.x, y: f.y }
  }

  const wallIds: string[] = []
  const originalWallById: Record<string, { a: Point; b: Point }> = {}
  const currentWallById: Record<string, { a: Point; b: Point }> = {}
  for (const w of interiorWalls) {
    const parentRoom = roomsById.get(w.roomId)
    if (!parentRoom || !parentRoom.visible || parentRoom.locked) continue
    if (!roomIdSet.has(w.roomId) && !selectedSet.has(w.id)) continue
    wallIds.push(w.id)
    originalWallById[w.id] = { a: w.a, b: w.b }
    currentWallById[w.id] = { a: w.a, b: w.b }
  }

  return {
    kind: 'multi',
    roomIds,
    originalRoomPointsById,
    currentRoomPointsById,
    furnitureIds,
    originalFurniturePosById,
    currentFurniturePosById,
    wallIds,
    originalWallById,
    currentWallById,
  }
}

/** Shared onPointerDown tail for all three body hit tests (furniture/wall/
 * room), for both single-item and multi-selected drags: snapshot the given
 * ids into a MultiDragState and enter 'multi' interaction mode. */
function startMultiDrag(selectedIds: string[], worldPt: Point) {
  const { setDragState, setInteractionMode, setDragAnchorWorld } = useUIStore.getState()
  setDragState(buildMultiDragState(selectedIds))
  setInteractionMode('multi')
  setDragAnchorWorld(worldPt)
  lastClickEdge = null
}

export const SelectTool: ToolHandlers = {
  onPointerDown(worldPt: Point, rawWorldPt: Point, ppu: number, modifiers: PointerModifiers) {
    const { setInteractionMode, setDragAnchorWorld } = useUIStore.getState()
    setInteractionMode('idle')
    setDragAnchorWorld(null)

    const { rooms, interiorWalls, furnitureInstances, referenceImages } = useProjectStore.getState().project
    const {
      lockedLayers,
      selectedIds,
      setSelection,
      setSelectedWall,
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
        if (distance(rawWorldPt, rotateHandle) <= FURNITURE_ROTATE_HANDLE_HIT_THRESHOLD_PX / ppu) {
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
          if (distance(rawWorldPt, corners[ci]) <= FURNITURE_HANDLE_HIT_THRESHOLD_PX / ppu) {
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
        if (pointInRotatedRect(rawWorldPt, { x: f.x, y: f.y, width: f.width, height: f.depth }, f.rotation)) {
          const isMultiSelected = selectedIds.length > 1 && selectedIds.includes(f.id)
          if (!isMultiSelected) setSelection([f.id])
          startMultiDrag(isMultiSelected ? selectedIds : [f.id], worldPt)
          return
        }
      }
    }

    // Read once and reused below (5.5's reference-image test sits between
    // this room block and the marquee fallback, but is independently gated
    // by lockedLayers.referenceImages so it needed to leave this condition).
    const roomsUnlocked = !lockedLayers.rooms

    if (roomsUnlocked) {
      // 1. Vertex hit test takes priority over edge hit test (vertices sit on
      // edges' endpoints).
      for (let ri = rooms.length - 1; ri >= 0; ri--) {
        const room = rooms[ri]
        if (!room.visible || room.locked) continue
        const pts = room.points
        const vertexThresholdWorld = wallThresholdWorld(VERTEX_HIT_THRESHOLD_PX, room.wallThickness, ppu)
        for (let vi = 0; vi < pts.length; vi++) {
          if (distance(rawWorldPt, pts[vi]) <= vertexThresholdWorld) {
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
          if (distanceToSegment(rawWorldPt, a, b) <= thresholdWorld) {
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
          distance(rawWorldPt, wall.a) <= vertexThresholdWorld
            ? 'a'
            : distance(rawWorldPt, wall.b) <= vertexThresholdWorld
              ? 'b'
              : null
        if (which) {
          setSelection([wall.id])
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
        if (distanceToSegment(rawWorldPt, wall.a, wall.b) <= thresholdWorld) {
          const isMultiSelected = selectedIds.length > 1 && selectedIds.includes(wall.id)
          if (!isMultiSelected) setSelection([wall.id])
          startMultiDrag(isMultiSelected ? selectedIds : [wall.id], worldPt)
          return
        }
      }

      // 5. Room body hit test - select and (E5) begin a room drag. If the
      // clicked room is part of an existing multi-selection, drag every
      // selected room together, preserving relative positions.
      for (let ri = rooms.length - 1; ri >= 0; ri--) {
        const room = rooms[ri]
        if (!room.visible || room.locked) continue
        if (pointInPolygon(rawWorldPt, room.points)) {
          const isMultiSelected = selectedIds.length > 1 && selectedIds.includes(room.id)
          setSelectedWall(null)

          if (!isMultiSelected) setSelection([room.id])
          startMultiDrag(isMultiSelected ? selectedIds : [room.id], worldPt)
          return
        }
      }
    }

    // 5.5. Reference image hit test (I3) - images render beneath
    // rooms/furniture, so this runs after those hit tests fail to find
    // anything. Gated independently by lockedLayers.referenceImages (not
    // lockedLayers.rooms), same as the furniture body test above.
    if (!lockedLayers.referenceImages) {
      for (let ii = referenceImages.length - 1; ii >= 0; ii--) {
        const img = referenceImages[ii]
        if (!img.visible || img.locked) continue
        if (pointInRotatedRect(rawWorldPt, img, img.rotation)) {
          setSelection([img.id])
          lastClickEdge = null
          return
        }
      }
    }

    // 6. Nothing hit: begin a marquee drag. Whether this ends up being a
    // plain click (deselect) or an actual drag (box-select) is resolved on
    // pointer-up, once we know the total drag distance. This always starts,
    // regardless of any layer's lock state - locked layers only affect which
    // entities the marquee can pick up on release (step 3 below), not
    // whether a marquee can be drawn at all.
    lastClickEdge = null
    setInteractionMode('marquee')
    setMarquee({ start: worldPt, end: worldPt, additive: modifiers.shift })
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

    if (mode === 'multi' && dragState?.kind === 'multi' && dragAnchorWorld) {
      const dx = worldPt.x - dragAnchorWorld.x
      const dy = worldPt.y - dragAnchorWorld.y

      const currentRoomPointsById: Record<string, Point[]> = {}
      for (const id of dragState.roomIds) {
        const orig = dragState.originalRoomPointsById[id]
        if (!orig) continue
        currentRoomPointsById[id] = orig.map((p) => ({ x: p.x + dx, y: p.y + dy }))
      }

      const currentFurniturePosById: Record<string, Point> = {}
      for (const id of dragState.furnitureIds) {
        const orig = dragState.originalFurniturePosById[id]
        if (!orig) continue
        currentFurniturePosById[id] = { x: orig.x + dx, y: orig.y + dy }
      }

      const currentWallById: Record<string, { a: Point; b: Point }> = {}
      for (const id of dragState.wallIds) {
        const orig = dragState.originalWallById[id]
        if (!orig) continue
        currentWallById[id] = {
          a: { x: orig.a.x + dx, y: orig.a.y + dy },
          b: { x: orig.b.x + dx, y: orig.b.y + dy },
        }
      }

      setDragState({ ...dragState, currentRoomPointsById, currentFurniturePosById, currentWallById })
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
      const { rooms, interiorWalls, furnitureInstances, referenceImages } = useProjectStore.getState().project
      const minX = Math.min(marquee.start.x, marquee.end.x)
      const maxX = Math.max(marquee.start.x, marquee.end.x)
      const minY = Math.min(marquee.start.y, marquee.end.y)
      const maxY = Math.max(marquee.start.y, marquee.end.y)
      const inBox = (p: Point) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY

      const wasDrag = movedWorld * ppu >= MARQUEE_MIN_DRAG_PX

      if (!wasDrag) {
        // Plain click on empty space: preserve existing deselect behavior.
        if (!marquee.additive) clearSelection()
      } else {
        const { lockedLayers } = useUIStore.getState()

        const roomIds = lockedLayers.rooms
          ? []
          : rooms
              .filter((r) => r.visible && !r.locked)
              .filter((r) => r.points.every(inBox))
              .map((r) => r.id)

        const furnitureIds = lockedLayers.furniture
          ? []
          : furnitureInstances
              .filter((f) => f.visible && !f.locked)
              .filter((f) => furnitureCorners(f).every(inBox))
              .map((f) => f.id)

        // Interior walls belong to their parent room's layer - there's no
        // separate lockedLayers entry for them, matching the click-select
        // hit tests above (steps 3/4).
        const interiorWallIds = lockedLayers.rooms
          ? []
          : interiorWalls
              .filter((w) => {
                const parentRoom = rooms.find((r) => r.id === w.roomId)
                return !!parentRoom && parentRoom.visible && !parentRoom.locked
              })
              .filter((w) => inBox(w.a) && inBox(w.b))
              .map((w) => w.id)

        const imageIds = lockedLayers.referenceImages
          ? []
          : referenceImages
              .filter((img) => img.visible && !img.locked)
              .filter((img) => imageCorners(img).every(inBox))
              .map((img) => img.id)

        const hitIds = [...roomIds, ...furnitureIds, ...interiorWallIds, ...imageIds]

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

    if (mode === 'multi' && dragState?.kind === 'multi') {
      const { project } = useProjectStore.getState()
      const roomsById = new Map(project.rooms.map((r) => [r.id, r]))
      const furnitureById = new Map(project.furnitureInstances.map((f) => [f.id, f]))
      const wallsById = new Map(project.interiorWalls.map((w) => [w.id, w]))

      const moved =
        dragState.roomIds.some((id) => {
          const room = roomsById.get(id)
          const next = dragState.currentRoomPointsById[id]
          return !!room && !!next && !pointsEqual(room.points, next)
        }) ||
        dragState.furnitureIds.some((id) => {
          const f = furnitureById.get(id)
          const next = dragState.currentFurniturePosById[id]
          return !!f && !!next && (f.x !== next.x || f.y !== next.y)
        }) ||
        dragState.wallIds.some((id) => {
          const w = wallsById.get(id)
          const next = dragState.currentWallById[id]
          return !!w && !!next && !pointsEqual([w.a, w.b], [next.a, next.b])
        })

      if (moved) {
        useHistoryStore.getState().pushSnapshot(project)
        for (const id of dragState.roomIds) {
          const nextPoints = dragState.currentRoomPointsById[id]
          if (nextPoints) useProjectStore.getState().updateRoom(id, { points: nextPoints })
        }
        for (const id of dragState.furnitureIds) {
          const next = dragState.currentFurniturePosById[id]
          if (next) useProjectStore.getState().updateFurniture(id, { x: next.x, y: next.y })
        }
        for (const id of dragState.wallIds) {
          const next = dragState.currentWallById[id]
          if (next) useProjectStore.getState().updateInteriorWall(id, { a: next.a, b: next.b })
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
  // hit radius whenever snap-to-grid is on. So once a furniture instance is
  // selected, pointer coordinates are raw for the rest of that interaction -
  // hit-testing, and the ensuing resize/rotate/move drag. This also covers
  // furniture dragged as part of a multi-selection (#27's 'multi' drag
  // state): without it, every pointer-move during that drag gets re-snapped
  // to the grid, and furniture - previously always raw-pointer-smooth in the
  // single-select case - visibly jumps in grid increments instead of
  // tracking the cursor.
  wantsRawPointer() {
    const { selectedIds } = useUIStore.getState()
    const { furnitureInstances } = useProjectStore.getState().project
    return furnitureInstances.some((f) => selectedIds.includes(f.id))
  },
}
