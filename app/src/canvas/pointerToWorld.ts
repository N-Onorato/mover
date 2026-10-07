import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Point } from '../types/project'
import { useUIStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { snapToGrid, adaptiveGridSize } from '../utils/snap'
import { pixelsPerUnitFor, screenToWorld } from '../utils/scale'
import { TOOLS } from './tools'

// Screen->world projection for pointer handling, tap-to-place, and drag-drop
// placement. Reads the live view/settings from the stores (not React props),
// so memoized callers never see a stale pan/zoom after the view changes.

/** Project a container-relative screen point into world space, optionally grid-snapped. */
export function toWorld(pos: Point, snap: boolean): Point {
  const { view } = useUIStore.getState()
  const world = screenToWorld(pos, view)
  if (!snap) return world
  const { gridSize } = useProjectStore.getState().project.settings
  return snapToGrid(world, adaptiveGridSize(gridSize, view.scale))
}

/** toWorld, snapped according to the project's snap-to-grid setting. */
export function toWorldPerSetting(pos: Point): Point {
  return toWorld(pos, useProjectStore.getState().project.settings.snapToGrid)
}

/**
 * World point for a stage pointer event. Holding Ctrl inverts the
 * snap-to-grid setting for this event (Shift is taken by SelectTool's
 * marquee shift-add), and tools that want raw coordinates are never snapped.
 */
export function pointerToWorld(e: KonvaEventObject<PointerEvent>, stage: Konva.Stage): Point {
  const { snapToGrid: snapSetting } = useProjectStore.getState().project.settings
  const wantsRaw = TOOLS[useUIStore.getState().activeTool].wantsRawPointer?.() ?? false
  const snap = (e.evt.ctrlKey ? !snapSetting : snapSetting) && !wantsRaw
  return toWorld(stage.getPointerPosition()!, snap)
}

/** Live pixels-per-unit, so hit-test thresholds (px/ppu) match the current zoom. */
export function livePixelsPerUnit(): number {
  return pixelsPerUnitFor(useUIStore.getState().view.scale)
}
