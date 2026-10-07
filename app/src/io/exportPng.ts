import type { Annotation, Point, Project } from '../types/project'
import type { UnitSystem } from '../utils/units'
import { rotatePoint } from '../utils/geometry'
import { layoutFurniture } from '../project/layouts'

/** O5 (#45): the pure half of the PNG export dialog - which part of the plan
 * to export, how big the image comes out, what to call the file. The dialog
 * (components/ExportPngDialog.tsx) renders an off-screen-style Stage from
 * these numbers and calls `stage.toDataURL`; nothing here touches Konva, a
 * store or the DOM (bar `downloadDataUrl`), so it is all unit-testable.
 *
 * Everything is in world units (inches or cm, per project) until the dialog
 * multiplies by pixels-per-unit. */

/** An axis-aligned rectangle in world units. */
export interface WorldRect {
  x: number
  y: number
  width: number
  height: number
}

export type ExportArea = 'content' | 'view' | 'selection'
export type ExportBackground = 'project' | 'white' | 'transparent' | 'custom'

/** Which entity groups count towards the content bounds. The caller ANDs the
 * dialog's include toggles with the Layers-panel visibility, so a hidden
 * layer neither draws nor stretches the export area. Rooms cover interior
 * walls too (they share one layer toggle, as in InteriorWallLayer). */
export interface ContentInclude {
  rooms: boolean
  furniture: boolean
  referenceImages: boolean
  annotations: boolean
}

export const EXPORT_SCALES = [1, 2, 4] as const
export type ExportScale = (typeof EXPORT_SCALES)[number]

/** Largest side of the exported bitmap. Chrome and Firefox stop at 32767 and
 * Safari lower, but a canvas that large is already hostile to memory; 16384
 * is the widely supported "safe" size. */
export const MAX_EXPORT_SIDE = 16384

/** Largest total pixel count. Konva's toDataURL allocates the output canvas
 * plus an equally sized buffer canvas, so 40 MP is roughly 320 MB of RGBA at
 * the moment of export - about as much as a tab can be asked for without a
 * real chance of the canvas silently coming back blank. */
export const MAX_EXPORT_PIXELS = 40_000_000

export function unionRects(rects: WorldRect[]): WorldRect | null {
  if (rects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function padRect(rect: WorldRect, margin: number): WorldRect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  }
}

function pointsBounds(points: Point[], pad = 0): WorldRect {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) + pad - minX,
    height: Math.max(...ys) + pad - minY,
  }
}

/** Bounding box of a top-left-anchored rectangle rotated about its own
 * center - the convention furniture and reference images are drawn with. */
export function rotatedRectBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): WorldRect {
  const center: Point = { x: x + width / 2, y: y + height / 2 }
  const corners: Point[] = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ].map((p) => rotatePoint(p, center, rotation))
  return pointsBounds(corners)
}

/** Rough extent of an annotation. AnnotationLayer is still a stub that draws
 * nothing, so there is no rendered geometry to measure; this keeps the bounds
 * honest for when it does (a text label is estimated from its font size). */
function annotationBounds(a: Annotation): WorldRect {
  if (a.type === 'text') {
    const width = Math.max(1, a.text.length) * a.fontSize * 0.6
    const height = a.fontSize * 1.2
    return rotatedRectBounds(a.x, a.y, width, height, a.rotation)
  }
  return pointsBounds([a.p1, a.p2], Math.abs(a.offset))
}

/** The bounding box of everything that would be drawn: rooms (stroke
 * included, so thick walls are not clipped), interior walls, the chosen
 * layout's furniture, reference images and annotations. Entities flagged
 * `visible: false` are skipped, matching the layers. `onlyIds` restricts the
 * result to those entities (the "selection" area). Null when nothing is left.
 *
 * Deliberately has no margin; callers pad it. */
export function contentBounds(
  project: Project,
  layoutId: string,
  include: ContentInclude,
  onlyIds?: ReadonlySet<string>,
): WorldRect | null {
  const wanted = (id: string) => onlyIds === undefined || onlyIds.has(id)
  const rects: WorldRect[] = []

  if (include.rooms) {
    for (const room of project.rooms) {
      if (!room.visible || room.points.length === 0 || !wanted(room.id)) continue
      rects.push(pointsBounds(room.points, room.wallThickness / 2))
    }
    for (const wall of project.interiorWalls) {
      if (!wall.visible || !(wanted(wall.id) || wanted(wall.roomId))) continue
      const room = project.rooms.find((r) => r.id === wall.roomId)
      if (!room || !room.visible) continue
      rects.push(pointsBounds([wall.a, wall.b], wall.thickness / 2))
    }
  }
  if (include.furniture) {
    for (const f of layoutFurniture(project, layoutId)) {
      if (!f.visible || !wanted(f.id)) continue
      rects.push(rotatedRectBounds(f.x, f.y, f.width, f.depth, f.rotation))
    }
  }
  if (include.referenceImages) {
    for (const img of project.referenceImages) {
      if (!img.visible || !wanted(img.id)) continue
      rects.push(rotatedRectBounds(img.x, img.y, img.width, img.height, img.rotation))
    }
  }
  if (include.annotations) {
    for (const a of project.annotations) {
      if (!wanted(a.id)) continue
      rects.push(annotationBounds(a))
    }
  }
  return unionRects(rects)
}

/** Breathing room around fit-to-content and selection exports: 2 ft or
 * 50 cm, so the outermost wall stroke does not touch the image edge. */
export function exportMargin(units: UnitSystem): number {
  return units === 'metric' ? 50 : 24
}

/** The world-space rectangle currently visible in a viewport `viewWidth` by
 * `viewHeight` pixels, panned to (view.x, view.y) at `pixelsPerUnit`. */
export function viewRect(
  view: { x: number; y: number },
  viewWidth: number,
  viewHeight: number,
  pixelsPerUnit: number,
): WorldRect {
  return {
    x: -view.x / pixelsPerUnit,
    y: -view.y / pixelsPerUnit,
    width: viewWidth / pixelsPerUnit,
    height: viewHeight / pixelsPerUnit,
  }
}

export interface ExportSize {
  /** The scale actually used: the requested one, or lower when capped. */
  scale: number
  width: number
  height: number
  /** True when the requested scale was reduced to stay within the caps. */
  capped: boolean
}

/** Output bitmap size for an area that measures `baseWidth` x `baseHeight`
 * pixels at 1x, rendered at `requestedScale`. Reduces the scale (never the
 * aspect ratio) until both sides fit MAX_EXPORT_SIDE and the area fits
 * MAX_EXPORT_PIXELS, and reports that it did. Sides are floored so the caps
 * are never exceeded, and are at least 1 px. */
export function fitExportSize(
  baseWidth: number,
  baseHeight: number,
  requestedScale: number,
): ExportSize {
  const w = Math.max(baseWidth, 1)
  const h = Math.max(baseHeight, 1)
  const maxScale = Math.min(
    MAX_EXPORT_SIDE / w,
    MAX_EXPORT_SIDE / h,
    Math.sqrt(MAX_EXPORT_PIXELS / (w * h)),
  )
  const scale = Math.min(requestedScale, maxScale)
  return {
    scale,
    width: Math.max(1, Math.floor(w * scale)),
    height: Math.max(1, Math.floor(h * scale)),
    capped: scale < requestedScale,
  }
}

/** CSS color painted behind the plan, or null for a transparent export. */
export function resolveBackground(
  mode: ExportBackground,
  projectColor: string,
  customColor: string,
): string | null {
  switch (mode) {
    case 'project':
      return projectColor
    case 'white':
      return '#ffffff'
    case 'custom':
      return customColor
    case 'transparent':
      return null
  }
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const MAX_NAME_LENGTH = 100

/** Makes one name safe to use as (part of) a filename on Windows, macOS and
 * Linux: strips path separators, reserved characters and control characters,
 * collapses whitespace, drops trailing dots and spaces, steers clear of
 * Windows device names, and bounds the length. Falls back to `fallback` when
 * nothing is left. */
export function sanitizeFilename(name: string, fallback = 'layout'): string {
  // Control characters are swapped for spaces by code point, not by regex
  // class, so the linter's no-control-regex has nothing to object to.
  const spaced = Array.from(name, (ch) => {
    const code = ch.charCodeAt(0)
    return code < 0x20 || code === 0x7f ? ' ' : ch
  }).join('')
  let cleaned = spaced
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length > MAX_NAME_LENGTH) cleaned = cleaned.slice(0, MAX_NAME_LENGTH)
  cleaned = cleaned.replace(/[. ]+$/, '').replace(/^\.+/, '').trim()
  if (cleaned === '') return fallback
  if (WINDOWS_RESERVED.test(cleaned)) return `${cleaned}_`
  return cleaned
}

/** `<project name>-<layout name>`, without extension. */
export function defaultExportName(projectName: string, layoutName: string): string {
  return `${sanitizeFilename(projectName, 'Untitled')}-${sanitizeFilename(layoutName, 'layout')}`
}

/** Sanitized download filename with exactly one `.png` extension. */
export function pngFilename(name: string): string {
  const base = sanitizeFilename(name.replace(/\.png$/i, ''))
  return `${base}.png`
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
