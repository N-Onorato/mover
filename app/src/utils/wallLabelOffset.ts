import type { Point } from '../types/project'

// E4: fixed pixel margin added on top of the wall's rendered thickness so the
// label clears the stroke even for thin walls.
const LABEL_MARGIN_PX = 10

// G1: WallLengthLabel renders at fontSize={15} with bold text, which Konva
// renders as a glyph box roughly 18-20px tall. The label's Text node is
// top-anchored (offsetY only repositions the anchor point, not the box's far
// edge), so without accounting for the box's own height, the offset was only
// guaranteed to clear the wall stroke at the anchor - the text could still
// extend back across the wall centerline. Adding the full rendered label
// height to the offset magnitude ensures the whole glyph box, not just its
// anchor point, clears the wall by at least LABEL_MARGIN_PX.
const LABEL_HEIGHT_PX = 20

/**
 * Wall-length labels (RoomLayer.tsx and SelectionLayer.tsx's WallLengthLabel)
 * are Konva <Text> nodes positioned at the wall's start point `a`, rotated to
 * match the wall's angle, with `width` spanning the wall length so the text
 * centers itself along the wall via `align="center"`.
 *
 * Under that rotation, Konva's local `offsetY` axis maps to the world-space
 * unit vector (sin(theta), -cos(theta)) - i.e. one of the two directions
 * perpendicular to the wall (theta = the label's `rotation`, in degrees).
 * This function returns the *signed* offsetY magnitude that pushes the label
 * along that perpendicular, scaled by the wall's rendered thickness plus a
 * fixed margin, and picks the sign that points away from `interiorRef` (e.g.
 * the room's centroid) when one is available.
 *
 * When `interiorRef` is omitted (e.g. while drawing a new, unclosed room
 * outline with no well-defined interior yet), a fixed perpendicular
 * direction is used instead - a reasonable approximation until the shape is
 * closed.
 */
export function wallLabelOffsetY(
  a: Point,
  b: Point,
  angleDeg: number,
  wallThicknessWorld: number,
  pixelsPerUnit: number,
  interiorRef?: Point,
): number {
  const magnitude = (wallThicknessWorld * pixelsPerUnit) / 2 + LABEL_MARGIN_PX + LABEL_HEIGHT_PX

  if (!interiorRef) {
    return magnitude
  }

  const theta = (angleDeg * Math.PI) / 180
  const perpX = Math.sin(theta)
  const perpY = -Math.cos(theta)

  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const inwardX = interiorRef.x - midX
  const inwardY = interiorRef.y - midY
  const dot = perpX * inwardX + perpY * inwardY

  // If the perpendicular already points toward the interior, flip it so the
  // label lands outward instead.
  return dot > 0 ? -magnitude : magnitude
}
