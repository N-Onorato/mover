import type { FurnitureDefinition } from '../types/project'
import { definitionDefaults } from '../furniture/catalog'

/** O2 (#42): the drag image for catalog / saved-set pieces.
 *
 * Without `setDragImage` the browser snapshots the dragged list row. Instead
 * we draw what FurnitureLayer would draw for the piece - its footprint at the
 * current canvas zoom, in the fill color it will actually be placed with, with
 * its name - so the ghost doubles as a size check while hovering over a room.
 */

/** Longest side of the ghost, so a sofa at high zoom doesn't cover the screen. */
export const MAX_PREVIEW_PX = 320
/** Shortest the ghost's longest side may get, so a lamp at low zoom is still
 * a visible target under the cursor. */
export const MIN_PREVIEW_PX = 24
/** No side collapses below this, however extreme the aspect ratio. */
const MIN_SIDE_PX = 2

export interface PreviewLayout {
  /** Size of the drag image in CSS pixels (integers: they size a canvas). */
  width: number
  height: number
  /** Where the cursor sits on the image: its center. Matches the placement
   * anchor - see `setFurnitureDragImage`. */
  hotspotX: number
  hotspotY: number
}

/** Pure size/cap/hotspot math, separate from the drawing so it is testable
 * without a DOM. `pixelsPerUnit` is the on-canvas scale (base pixels-per-unit
 * times the view zoom); the ghost is the footprint at that scale, uniformly
 * shrunk to MAX_PREVIEW_PX or grown to MIN_PREVIEW_PX on its longest side. The
 * hotspot is computed on the final (capped) size. */
export function computePreviewLayout(
  def: { width: number; depth: number },
  pixelsPerUnit: number,
): PreviewLayout {
  let w = def.width * pixelsPerUnit
  let h = def.depth * pixelsPerUnit
  const longest = Math.max(w, h)
  if (longest > 0) {
    const factor =
      longest > MAX_PREVIEW_PX
        ? MAX_PREVIEW_PX / longest
        : longest < MIN_PREVIEW_PX
          ? MIN_PREVIEW_PX / longest
          : 1
    w *= factor
    h *= factor
  } else {
    w = MIN_PREVIEW_PX
    h = MIN_PREVIEW_PX
  }
  const width = Math.max(MIN_SIDE_PX, Math.round(w))
  const height = Math.max(MIN_SIDE_PX, Math.round(h))
  return { width, height, hotspotX: width / 2, hotspotY: height / 2 }
}

const LABEL_FONT = '12px sans-serif'
const LABEL_PADDING = 4

/** Draw the footprint preview for `def` and hand it to the browser as the
 * drag image of `dataTransfer`. Call from the item's `dragstart` handler.
 *
 * The hotspot is the CENTER of the image because the drop point is the
 * piece's center: `LayoutCanvas.handleDrop` -> `placeFurnitureAt` ->
 * `createFurnitureInstance(def, center)` offsets the instance by half its
 * width/depth. The cursor therefore sits where the piece will be centered.
 * If placement ever anchors on a corner instead, change `hotspotX/Y` in
 * `computePreviewLayout` (and its test) to match.
 *
 * The canvas is drawn at 1x: the browser sizes the drag image from the
 * element's layout size, and a hi-dpi backing store would need per-browser
 * handling for a ghost that is semi-transparent anyway.
 */
export function setFurnitureDragImage(
  dataTransfer: DataTransfer,
  def: FurnitureDefinition,
  pixelsPerUnit: number,
): void {
  const layout = computePreviewLayout(def, pixelsPerUnit)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Same color the piece gets when placed (createFurnitureInstance spreads
  // definitionDefaults), and the same label.
  const { fillColor, label } = definitionDefaults(def)
  ctx.fillStyle = fillColor
  ctx.fillRect(0, 0, layout.width, layout.height)
  // FurnitureLayer's outline; inset by half a pixel so the 1px stroke isn't
  // cropped at the image edge.
  ctx.strokeStyle = '#00000055'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, layout.width - 1, layout.height - 1)

  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fits =
    layout.height >= 16 && ctx.measureText(label).width <= layout.width - LABEL_PADDING * 2
  if (fits) {
    ctx.fillStyle = '#1a1a1a'
    ctx.fillText(label, layout.width / 2, layout.height / 2)
  }

  // The browser snapshots the element during setDragImage only if it is
  // attached and rendered, so park it off-screen, then clean up once the
  // snapshot has been taken.
  canvas.style.position = 'fixed'
  canvas.style.left = '-10000px'
  canvas.style.top = '0'
  canvas.style.pointerEvents = 'none'
  document.body.appendChild(canvas)
  dataTransfer.setDragImage(canvas, layout.hotspotX, layout.hotspotY)
  setTimeout(() => canvas.remove(), 0)
}
