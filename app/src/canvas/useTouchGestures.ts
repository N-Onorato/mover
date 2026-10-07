import { useCallback, useMemo, useRef } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Point } from '../types/project'
import type { ViewState } from '../store/uiStore'
import { useUIStore } from '../store/uiStore'
import { distance, midpoint } from '../utils/geometry'
import { clampScale, screenToWorld, zoomKeepingWorldPointFixed } from '../utils/scale'

interface PinchStart {
  dist: number
  mid: Point
  view: ViewState
}

type PointerEvt = KonvaEventObject<PointerEvent>

/**
 * Multi-touch pinch-zoom/pan, and the gating that keeps it from also driving
 * the active tool. touchPoints holds container-relative positions of active
 * touch pointers only; mouse/pen pointers never enter it. Once a second finger
 * lands, tools are suppressed until every finger lifts, and anything the first
 * finger already started in the tool is cancelled via `onCancelTool`.
 *
 * Each handler returns true when the event is consumed and must not reach the
 * active tool.
 */
export function useTouchGestures(
  containerRef: { current: HTMLDivElement | null },
  onCancelTool: () => void,
) {
  const touchPoints = useRef(new Map<number, Point>())
  const pinchStart = useRef<PinchStart | null>(null)
  const suppressTools = useRef(false)
  // Whether the current single-finger touch reached the active tool, so a
  // second finger (or a browser cancel) can undo that stray pointer-down.
  const touchDispatchedToTool = useRef(false)
  // getBoundingClientRect() forces a layout read, so it's cached for the
  // duration of a touch gesture (refreshed when the first finger goes down)
  // rather than queried on every pointermove.
  const containerRect = useRef<DOMRect | null>(null)

  // Container-relative position of a pointer event. Used for multi-touch
  // gesture math instead of stage.getPointerPosition(), which only tracks a
  // single position per event and can't distinguish two fingers.
  const getContainerPoint = useCallback(
    (e: PointerEvt): Point => {
      if (!containerRect.current) containerRect.current = containerRef.current!.getBoundingClientRect()
      const rect = containerRect.current
      return { x: e.evt.clientX - rect.left, y: e.evt.clientY - rect.top }
    },
    [containerRef],
  )

  const cancelDispatchedTool = useCallback(() => {
    if (!touchDispatchedToTool.current) return
    onCancelTool()
    touchDispatchedToTool.current = false
  }, [onCancelTool])

  const removeTouch = useCallback((e: PointerEvt): number => {
    touchPoints.current.delete(e.evt.pointerId)
    // Any finger lifting ends the pinch; suppression persists until the
    // last finger is up so the remaining finger can't start drawing.
    pinchStart.current = null
    const remaining = touchPoints.current.size
    if (remaining === 0) containerRect.current = null
    return remaining
  }, [])

  const onDown = useCallback(
    (e: PointerEvt): boolean => {
      if (e.evt.pointerType !== 'touch') return suppressTools.current
      touchPoints.current.set(e.evt.pointerId, getContainerPoint(e))
      if (touchPoints.current.size === 2) {
        // Second finger down: this is a pan/pinch gesture, not a tool action.
        suppressTools.current = true
        const [p1, p2] = [...touchPoints.current.values()]
        pinchStart.current = { dist: distance(p1, p2), mid: midpoint(p1, p2), view: useUIStore.getState().view }
        cancelDispatchedTool()
        return true
      }
      return suppressTools.current
    },
    [getContainerPoint, cancelDispatchedTool],
  )

  /** Call after a pointer-down was dispatched to the active tool. */
  const onToolDispatched = useCallback((e: PointerEvt) => {
    if (e.evt.pointerType === 'touch') touchDispatchedToTool.current = true
  }, [])

  const onMove = useCallback(
    (e: PointerEvt): boolean => {
      if (e.evt.pointerType !== 'touch') return false
      if (!touchPoints.current.has(e.evt.pointerId)) return suppressTools.current
      touchPoints.current.set(e.evt.pointerId, getContainerPoint(e))
      const start = pinchStart.current
      if (start && touchPoints.current.size >= 2) {
        // Anchored pinch-zoom around the fingers' midpoint. All math is
        // relative to the gesture's start state, so a near-constant distance
        // ratio degenerates into a pure pan.
        const [p1, p2] = [...touchPoints.current.values()]
        const ratio = start.dist > 0 ? distance(p1, p2) / start.dist : 1
        const newScale = clampScale(start.view.scale * ratio)
        const worldPoint = screenToWorld(start.mid, start.view)
        useUIStore.getState().setView(zoomKeepingWorldPointFixed(worldPoint, midpoint(p1, p2), newScale))
        return true
      }
      return suppressTools.current
    },
    [getContainerPoint],
  )

  const onUp = useCallback(
    (e: PointerEvt): boolean => {
      if (e.evt.pointerType !== 'touch') return false
      const remaining = removeTouch(e)
      const consumed = suppressTools.current
      if (remaining === 0) suppressTools.current = false
      touchDispatchedToTool.current = false
      return consumed
    },
    [removeTouch],
  )

  /** Returns false for non-touch pointers, which the caller handles itself. */
  const onCancel = useCallback(
    (e: PointerEvt): boolean => {
      if (e.evt.pointerType !== 'touch') return false
      cancelDispatchedTool()
      if (removeTouch(e) === 0) suppressTools.current = false
      return true
    },
    [cancelDispatchedTool, removeTouch],
  )

  /** Whether any finger is currently down. */
  const hasTouches = useCallback(() => touchPoints.current.size > 0, [])

  return useMemo(
    () => ({ onDown, onToolDispatched, onMove, onUp, onCancel, hasTouches }),
    [onDown, onToolDispatched, onMove, onUp, onCancel, hasTouches],
  )
}
