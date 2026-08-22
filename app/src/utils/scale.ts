import type { Point } from '../types/project'

/** Screen pixels per world unit at zoom 1 (10px per inch-or-cm grid unit at
 * the default 12-unit grid, i.e. 10px per foot). Multiplied by `view.scale`
 * wherever world coordinates are drawn - the main canvas and every read-only
 * comparison pane, which must agree on it to be comparable at all. */
export const BASE_PIXELS_PER_UNIT = 10

export interface ScaleConfig {
  pixelsPerUnit: number
  zoom: number
  originX: number
  originY: number
}

export function worldToScreen(pt: Point, cfg: ScaleConfig): Point {
  const ppu = cfg.pixelsPerUnit * cfg.zoom
  return {
    x: pt.x * ppu + cfg.originX,
    y: pt.y * ppu + cfg.originY,
  }
}

export function screenToWorld(pt: Point, cfg: ScaleConfig): Point {
  const ppu = cfg.pixelsPerUnit * cfg.zoom
  return {
    x: (pt.x - cfg.originX) / ppu,
    y: (pt.y - cfg.originY) / ppu,
  }
}

export function worldLengthToPixels(units: number, cfg: ScaleConfig): number {
  return units * cfg.pixelsPerUnit * cfg.zoom
}

export function pixelsToWorldLength(px: number, cfg: ScaleConfig): number {
  return px / (cfg.pixelsPerUnit * cfg.zoom)
}
