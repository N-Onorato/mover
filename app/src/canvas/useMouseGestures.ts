import { useCallback, useEffect, useMemo, useRef } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Point } from '../types/project'
import type { PointerModifiers } from './tools/types'
import { useUIStore } from '../store/uiStore'
import { clampScale, screenToWorld, zoomKeepingWorldPointFixed } from '../utils/scale'
import { livePixelsPerUnit } from './pointerToWorld'
import { TOOLS } from './tools'

type PointerEvt = KonvaEventObject<PointerEvent>

/**
 * Mouse/pen press-and-hold gestures: middle-mouse/space-drag panning,
 * cursor-anchored wheel zoom, and keeping a held pan/drag/marquee sane when
 * the pointer leaves the canvas (O1, #41). Touch has its own path
 * (useTouchGestures). State lives in refs so a gesture doesn't re-render on
 * every pointermove.
 *
 * O1 bookkeeping: capturedPointerId is the pointer whose events the stage's
 * content element has captured, so a release outside the canvas still reaches
 * pointer-up. gestureRect is the container's client rect frozen at
 * pointer-down: while a gesture is held, pointer positions outside it are
 * ignored, so the gesture always resolves at the last in-canvas position
 * instead of tracking the pointer over the sidebars. lastGesture is that last
 * in-canvas position, which is what a release outside the canvas (or a lost
 * capture) commits at.
 */
export function useMouseGestures(
  stageRef: { current: Konva.Stage | null },
  containerRef: { current: HTMLDivElement | null },
) {
  const isPanning = useRef(false)
  const panAnchor = useRef({ clientX: 0, clientY: 0, vx: 0, vy: 0 })
  const isSpaceHeld = useRef(false)
  const capturedPointerId = useRef<number | null>(null)
  const gestureRect = useRef<DOMRect | null>(null)
  const lastGesture = useRef<{ pt: Point; mods: PointerModifiers } | null>(null)

  // Whether a mouse/pen gesture (pan, drag, marquee) is currently held.
  const isGestureActive = useCallback(
    () => isPanning.current || useUIStore.getState().interactionMode !== 'idle',
    [],
  )

  // True when a pointer event landed outside the container the gesture began
  // in (only reachable while the stage's content element holds capture).
  const isOutsideGestureRect = useCallback((e: PointerEvt): boolean => {
    const r = gestureRect.current
    if (!r) return false
    return e.evt.clientX < r.left || e.evt.clientX > r.right || e.evt.clientY < r.top || e.evt.clientY > r.bottom
  }, [])

  /** Ends whatever mouse/pen gesture is in flight as if the button had been
   * released at the last in-canvas position - a pan just stops, a SelectTool
   * drag/marquee commits through its normal onPointerUp (at most one undo
   * snapshot). Idempotent: with nothing in flight it does nothing, so every
   * path that can end a gesture (pointer-up, lost capture, cancel, a stale
   * pointer-down, a button-less pointer-move) can call it freely. */
  const endGesture = useCallback(() => {
    capturedPointerId.current = null
    gestureRect.current = null
    const last = lastGesture.current
    lastGesture.current = null
    if (isPanning.current) {
      isPanning.current = false
      return
    }
    const { activeTool, interactionMode } = useUIStore.getState()
    if (!last || interactionMode === 'idle') return
    TOOLS[activeTool].onPointerUp(last.pt, livePixelsPerUnit(), last.mods)
  }, [])

  // A lost capture without a preceding pointer-up (element removed, browser
  // took the pointer back) must still end the gesture. After a normal
  // pointer-up `release` has already cleared capturedPointerId, so the
  // lostpointercapture the browser fires afterwards is a no-op.
  useEffect(() => {
    const content = stageRef.current?.content
    if (!content) return
    function onLostCapture(e: PointerEvent) {
      if (capturedPointerId.current === e.pointerId) endGesture()
    }
    content.addEventListener('lostpointercapture', onLostCapture)
    return () => content.removeEventListener('lostpointercapture', onLostCapture)
  }, [stageRef, endGesture])

  /** Pointer-down. Returns true when it started a pan, which the active tool must not see. */
  const onDown = useCallback(
    (e: PointerEvt): boolean => {
      const button = e.evt.button
      if (e.evt.pointerType !== 'touch' && (button === 0 || button === 1)) {
        // A pointer-down while a previous gesture is still open means its
        // pointer-up never arrived - close it out first so nothing stale leaks
        // into this one - then capture this pointer so *its* pointer-up is
        // delivered even when released outside the canvas.
        if (isGestureActive()) endGesture()
        try {
          stageRef.current?.content.setPointerCapture(e.evt.pointerId)
          capturedPointerId.current = e.evt.pointerId
        } catch {
          // Capture can fail for a pointer the browser no longer considers
          // active; the button-less pointer-move check still ends the gesture.
          capturedPointerId.current = null
        }
        gestureRect.current = containerRef.current?.getBoundingClientRect() ?? null
      }
      if (button === 1 || (button === 0 && isSpaceHeld.current)) {
        const { view } = useUIStore.getState()
        isPanning.current = true
        panAnchor.current = { clientX: e.evt.clientX, clientY: e.evt.clientY, vx: view.x, vy: view.y }
        e.evt.preventDefault()
        return true
      }
      return false
    },
    [stageRef, containerRef, isGestureActive, endGesture],
  )

  /** Remember where the tool last saw a held mouse/pen gesture, for a release
   * outside the canvas to commit at. */
  const recordToolPoint = useCallback((e: PointerEvt, pt: Point, mods: PointerModifiers) => {
    if (e.evt.pointerType !== 'touch' && gestureRect.current) lastGesture.current = { pt, mods }
  }, [])

  /** Pointer-move. Returns true when consumed: a pan update, or a held
   * gesture whose pointer is outside the canvas (it holds at the last
   * in-canvas position). `touchActive` skips the O1 checks while fingers are
   * down, since those gestures belong to useTouchGestures. */
  const onMove = useCallback(
    (e: PointerEvt, touchActive: boolean): boolean => {
      if (e.evt.pointerType !== 'touch' && !touchActive && isGestureActive()) {
        if (e.evt.buttons === 0) {
          // A gesture is open but no button is down - its release was missed.
          // End it where it last was rather than letting hover movement keep
          // dragging the entity.
          endGesture()
        } else if (!isPanning.current && isOutsideGestureRect(e)) {
          return true
        }
      }
      if (!isPanning.current) return false
      const { view, setView } = useUIStore.getState()
      const dx = e.evt.clientX - panAnchor.current.clientX
      const dy = e.evt.clientY - panAnchor.current.clientY
      setView({ ...view, x: panAnchor.current.vx + dx, y: panAnchor.current.vy + dy })
      return true
    },
    [isGestureActive, isOutsideGestureRect, endGesture],
  )

  /** Pointer-up bookkeeping for the release the capture was waiting for.
   * Returns the point to commit at when the release landed outside the
   * canvas (the last in-canvas position), else null. */
  const release = useCallback(
    (e: PointerEvt): Point | null => {
      if (e.evt.pointerType === 'touch') return null
      const outside = isOutsideGestureRect(e)
      const last = lastGesture.current
      capturedPointerId.current = null
      gestureRect.current = null
      lastGesture.current = null
      return outside && last ? last.pt : null
    },
    [isOutsideGestureRect],
  )

  /** Returns true if a pan was in progress and has now ended. */
  const endPan = useCallback((): boolean => {
    if (!isPanning.current) return false
    isPanning.current = false
    return true
  }, [])

  // Scroll zooms at the cursor - SHORTCUTS['canvas.zoom'].
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const { view, setView } = useUIStore.getState()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const cursor: Point = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }
    const worldPoint = screenToWorld(cursor, view)
    setView(zoomKeepingWorldPointFixed(worldPoint, cursor, clampScale(view.scale * zoomFactor)))
  }, [])

  return useMemo(
    () => ({ isSpaceHeld, onDown, recordToolPoint, onMove, release, endPan, endGesture, handleWheel }),
    [onDown, recordToolPoint, onMove, release, endPan, endGesture, handleWheel],
  )
}
