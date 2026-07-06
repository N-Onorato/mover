import type { Point } from '../types/project'

export function snapToGrid(pt: Point, gridSize: number): Point {
  return {
    x: Math.round(pt.x / gridSize) * gridSize,
    y: Math.round(pt.y / gridSize) * gridSize,
  }
}

export function adaptiveGridSize(baseGridSize: number, zoom: number): number {
  if (zoom >= 3) return baseGridSize / 12
  if (zoom >= 1.5) return baseGridSize / 2
  if (zoom >= 0.5) return baseGridSize
  return baseGridSize * 2
}

export function snapToNearest(value: number, candidates: number[], threshold: number): number {
  for (const c of candidates) {
    if (Math.abs(value - c) <= threshold) return c
  }
  return value
}
