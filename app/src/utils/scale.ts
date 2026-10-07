import type { Point } from '../types/project'
import type { ViewState } from '../store/uiStore'

/** Screen pixels per world unit at zoom 1 (10px per inch-or-cm grid unit at
 * the default 12-unit grid, i.e. 10px per foot). Multiplied by `view.scale`
 * wherever world coordinates are drawn - the main canvas and every read-only
 * comparison pane, which must agree on it to be comparable at all. */
export const BASE_PIXELS_PER_UNIT = 10

/** Zoom factor for one zoom-in/out button or menu step. */
export const ZOOM_STEP = 1.2

export function pixelsPerUnitFor(scale: number): number {
  return BASE_PIXELS_PER_UNIT * scale
}

export function screenToWorld(pos: Point, view: ViewState): Point {
  const ppu = pixelsPerUnitFor(view.scale)
  return { x: (pos.x - view.x) / ppu, y: (pos.y - view.y) / ppu }
}

export function clampScale(scale: number): number {
  return Math.min(10, Math.max(0.05, scale))
}

/**
 * New view that keeps `worldPoint` glued under `screenAnchor` once the scale
 * changes to `newScale`. Used by both wheel-zoom (anchor = live cursor pos,
 * world point derived from the live view) and pinch-zoom (anchor = current
 * touch midpoint, world point derived from the view captured at gesture start)
 * — the two differ only in which view/screen point they read, not in the math.
 */
export function zoomKeepingWorldPointFixed(
  worldPoint: Point,
  screenAnchor: Point,
  newScale: number,
): ViewState {
  const ppu = pixelsPerUnitFor(newScale)
  return {
    x: screenAnchor.x - worldPoint.x * ppu,
    y: screenAnchor.y - worldPoint.y * ppu,
    scale: newScale,
  }
}
