import type { FurnitureInstance, InteriorWall, Point, ReferenceImage, Room } from '../../types/project'
import { angle, rectPoints, rotatePoint } from '../../utils/geometry'

/** O7 (#47): the pure math behind the multi-selection bounding box - bounds,
 * rotate-handle placement, and rotating a mixed selection about a pivot. No
 * store access here (SelectTool owns the gesture, the layers own the drawing),
 * so every rule below is unit-testable on plain data.
 *
 * Rotation uses the same convention as the single-furniture rotate handle and
 * rotatePoint(): degrees, positive = clockwise on screen (y grows downward). */

/** Rotation delta snaps to this many degrees when snapping is effective
 * (settings.snapToGrid, inverted by Ctrl - see SelectTool's furnitureRotate). */
export const MULTI_ROTATE_SNAP_DEGREES = 15

/** Breathing room between the selection's geometry and the drawn/hit-tested
 * box, in screen pixels. Keeps a selection of collinear walls (zero height)
 * from collapsing into an unhittable line. */
export const SELECTION_BOX_PAD_PX = 6

/** Distance from the box's top edge to the rotate handle, in screen pixels. */
export const SELECTION_ROTATE_HANDLE_OFFSET_PX = 24

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The selected entities' geometry, already resolved from ids (and already
 * filtered for locked/hidden entities by the caller). */
export interface SelectionGeometry {
  rooms: Pick<Room, 'points'>[]
  walls: Pick<InteriorWall, 'a' | 'b'>[]
  furniture: Pick<FurnitureInstance, 'x' | 'y' | 'width' | 'depth' | 'rotation'>[]
  images: Pick<ReferenceImage, 'x' | 'y' | 'width' | 'height' | 'rotation'>[]
}

/** Wraps degrees into [0, 360) - the range every rotation field uses. */
export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** Wraps a rotation delta into (-180, 180], so the readout shows the short way
 * around and snapping can't produce 360 or -360. */
export function normalizeDelta(deg: number): number {
  const d = normalizeDegrees(deg)
  return d > 180 ? d - 360 : d
}

/** The 4 corners (TL, TR, BR, BL) of a box rotated about its own center. */
function rotatedBoxCorners(r: Rect, rotation: number): Point[] {
  const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  return rectPoints(r.x, r.y, r.width, r.height).map((p) => rotatePoint(p, center, rotation))
}

/** Axis-aligned bounds of everything in the selection, or null when it has no
 * geometry. Room points, interior-wall endpoints, and the rotated corners of
 * furniture and reference images all count; the bounds are of the shapes
 * themselves, not of wall thickness. */
export function selectionBounds(g: SelectionGeometry): Rect | null {
  const pts: Point[] = []
  for (const r of g.rooms) pts.push(...r.points)
  for (const w of g.walls) pts.push(w.a, w.b)
  for (const f of g.furniture) {
    pts.push(...rotatedBoxCorners({ x: f.x, y: f.y, width: f.width, height: f.depth }, f.rotation))
  }
  for (const img of g.images) pts.push(...rotatedBoxCorners(img, img.rotation))
  if (pts.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** The box as drawn and hit-tested: the bounds grown by a fixed screen-pixel
 * margin on every side, so the center (the rotation pivot) is unchanged. */
export function selectionBoxRect(bounds: Rect, ppu: number): Rect {
  const pad = SELECTION_BOX_PAD_PX / ppu
  return { x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + pad * 2, height: bounds.height + pad * 2 }
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

export function pointInRect(pt: Point, r: Rect): boolean {
  return pt.x >= r.x && pt.x <= r.x + r.width && pt.y >= r.y && pt.y <= r.y + r.height
}

/** The rotate handle's world position for an unrotated box: a fixed pixel
 * offset above its top-mid edge. */
export function selectionRotateHandle(box: Rect, ppu: number): Point {
  return { x: box.x + box.width / 2, y: box.y - SELECTION_ROTATE_HANDLE_OFFSET_PX / ppu }
}

/** The rotation delta implied by the pointer's position around the pivot. The
 * handle sits straight above the box, so the pointer directly above the pivot
 * is a delta of 0 and each degree the pointer sweeps clockwise adds one.
 * Snapped deltas land on multiples of MULTI_ROTATE_SNAP_DEGREES. */
export function rotationDeltaFromPointer(pivot: Point, pointer: Point, snap: boolean): number {
  let delta = normalizeDelta(angle(pivot, pointer) + 90)
  if (snap) delta = normalizeDelta(Math.round(delta / MULTI_ROTATE_SNAP_DEGREES) * MULTI_ROTATE_SNAP_DEGREES)
  return delta
}

export function rotatePoints(points: Point[], pivot: Point, delta: number): Point[] {
  return points.map((p) => rotatePoint(p, pivot, delta))
}

export function rotateInteriorWall(
  w: Pick<InteriorWall, 'a' | 'b'>,
  pivot: Point,
  delta: number,
): Pick<InteriorWall, 'a' | 'b'> {
  return { a: rotatePoint(w.a, pivot, delta), b: rotatePoint(w.b, pivot, delta) }
}

/** Rotates a furniture instance rigidly about `pivot`: its center orbits the
 * pivot and its own rotation advances by `delta`. x/y are the stored
 * top-left of the *unrotated* box, so they're recovered from the moved
 * center (FurnitureLayer and hit-testing both rotate about that center). */
export function rotateFurniture(
  f: Pick<FurnitureInstance, 'x' | 'y' | 'width' | 'depth' | 'rotation'>,
  pivot: Point,
  delta: number,
): Pick<FurnitureInstance, 'x' | 'y' | 'rotation'> {
  const center = rotatePoint({ x: f.x + f.width / 2, y: f.y + f.depth / 2 }, pivot, delta)
  return { x: center.x - f.width / 2, y: center.y - f.depth / 2, rotation: normalizeDegrees(f.rotation + delta) }
}

/** Same rigid rotation for a reference image. Calibration points live in world
 * space (see specs/data-model.md), so they orbit the pivot with the photo;
 * leaving them behind would make a later Recalibrate anchor on a point that's
 * no longer on the feature it was clicked on. */
export function rotateImage(
  img: Pick<ReferenceImage, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'calibration'>,
  pivot: Point,
  delta: number,
): Pick<ReferenceImage, 'x' | 'y' | 'rotation' | 'calibration'> {
  const center = rotatePoint({ x: img.x + img.width / 2, y: img.y + img.height / 2 }, pivot, delta)
  return {
    x: center.x - img.width / 2,
    y: center.y - img.height / 2,
    rotation: normalizeDegrees(img.rotation + delta),
    calibration: img.calibration
      ? {
          ...img.calibration,
          p1: rotatePoint(img.calibration.p1, pivot, delta),
          p2: rotatePoint(img.calibration.p2, pivot, delta),
        }
      : null,
  }
}

export interface RotateTargets {
  roomIds: string[]
  furnitureIds: string[]
  wallIds: string[]
  imageIds: string[]
}

/** What committing a rotation writes to the project, one entry per entity. */
export interface RotatePatches {
  rooms: { id: string; points: Point[] }[]
  furniture: { id: string; patch: Pick<FurnitureInstance, 'x' | 'y' | 'rotation'> }[]
  walls: { id: string; patch: Pick<InteriorWall, 'a' | 'b'> }[]
  images: { id: string; patch: Pick<ReferenceImage, 'x' | 'y' | 'rotation' | 'calibration'> }[]
}

/** Resolves a rotation of `targets` about `pivot` into per-entity patches.
 * Ids with no matching entity are skipped, as in the multi-move commit. */
export function rotateSelectionPatches(
  entities: {
    rooms: Room[]
    furniture: FurnitureInstance[]
    walls: InteriorWall[]
    images: ReferenceImage[]
  },
  targets: RotateTargets,
  pivot: Point,
  delta: number,
): RotatePatches {
  const roomIds = new Set(targets.roomIds)
  const furnitureIds = new Set(targets.furnitureIds)
  const wallIds = new Set(targets.wallIds)
  const imageIds = new Set(targets.imageIds)
  return {
    rooms: entities.rooms
      .filter((r) => roomIds.has(r.id))
      .map((r) => ({ id: r.id, points: rotatePoints(r.points, pivot, delta) })),
    furniture: entities.furniture
      .filter((f) => furnitureIds.has(f.id))
      .map((f) => ({ id: f.id, patch: rotateFurniture(f, pivot, delta) })),
    walls: entities.walls
      .filter((w) => wallIds.has(w.id))
      .map((w) => ({ id: w.id, patch: rotateInteriorWall(w, pivot, delta) })),
    images: entities.images
      .filter((img) => imageIds.has(img.id))
      .map((img) => ({ id: img.id, patch: rotateImage(img, pivot, delta) })),
  }
}
