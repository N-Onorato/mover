import type { Point } from '../types/project'

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
