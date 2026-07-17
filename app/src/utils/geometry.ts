import type { Point } from '../types/project'

export function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function angle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)
}

export function polygonArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area) / 2
}

export function pointInPolygon(pt: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function polygonBoundingBox(points: Point[]): { x: number; y: number; width: number; height: number } {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

export function closestPointOnSegment(pt: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return a
  let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

export function distanceToSegment(pt: Point, a: Point, b: Point): number {
  return distance(pt, closestPointOnSegment(pt, a, b))
}

export function pointsEqual(a: Point[], b: Point[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y)
}

export function rectPoints(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

export function rotatePoint(pt: Point, center: Point, degrees: number): Point {
  const rad = degrees * (Math.PI / 180)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = pt.x - center.x
  const dy = pt.y - center.y
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

/** Hit test for a rectangle (given as top-left x/y plus width/height, before
 * rotation) that's rotated in place around its own center - unrotates the
 * point into the rectangle's local frame, then does a plain AABB check.
 * Shared by any entity type (furniture, reference images, ...) whose body is
 * a rotated axis-aligned box. */
export function pointInRotatedRect(
  pt: Point,
  rect: { x: number; y: number; width: number; height: number },
  degrees: number,
): boolean {
  const center: Point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const localPt = rotatePoint(pt, center, -degrees)
  return (
    localPt.x >= rect.x &&
    localPt.x <= rect.x + rect.width &&
    localPt.y >= rect.y &&
    localPt.y <= rect.y + rect.height
  )
}
