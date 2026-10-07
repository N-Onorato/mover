import { useRef, useEffect, useState, useCallback } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Stage } from 'react-konva'
import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import { createFurnitureInstance } from '../furniture/catalog'
import { resolveDefinition } from '../furniture/resolve'
import { GridLayer } from './layers/GridLayer'
import { ReferenceImageLayer } from './layers/ReferenceImageLayer'
import { RoomLayer } from './layers/RoomLayer'
import { InteriorWallLayer } from './layers/InteriorWallLayer'
import { HighlightLayer } from './layers/HighlightLayer'
import { FurnitureLayer } from './layers/FurnitureLayer'
import { AnnotationLayer } from './layers/AnnotationLayer'
import { SelectionLayer } from './layers/SelectionLayer'
import { Rulers } from './Rulers'
import { DrawingControls } from './DrawingControls'
import { FlowIndicator } from './FlowIndicator'
import { TOOLS } from './tools'
import type { PointerModifiers } from './tools/SelectTool'
import type { Point } from '../types/project'
import { snapToGrid } from '../utils/snap'
import { adaptiveGridSize } from '../utils/snap'
import { BASE_PIXELS_PER_UNIT } from '../utils/scale'
import { distance, midpoint } from '../utils/geometry'
import { setStage } from './stageRegistry'
import { isTypingTarget, matchesShortcut } from '../keyboard/shortcuts'
import styles from './LayoutCanvas.module.css'

export function LayoutCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const activeTool = useUIStore((s) => s.activeTool)
  const showGrid = useUIStore((s) => s.showGrid)
  const settings = useProjectStore((s) => s.project.settings)
  const backgroundColor = settings.backgroundColor

  const pixelsPerUnit = BASE_PIXELS_PER_UNIT * view.scale

  // Track panning state in refs (avoid re-renders)
  const isPanning = useRef(false)
  const panAnchor = useRef({ clientX: 0, clientY: 0, vx: 0, vy: 0 })
  const isSpaceHeld = useRef(false)

  // Touch gesture state (refs - no re-renders). touchPoints holds
  // container-relative positions of active touch pointers only; mouse/pen
  // pointers never enter it. While a second finger is down, tools are
  // suppressed until every finger lifts so a pinch never also draws/drags.
  const touchPoints = useRef(new Map<number, Point>())
  const pinchStart = useRef<{ dist: number; mid: Point; view: { x: number; y: number; scale: number } } | null>(null)
  const suppressTools = useRef(false)
  const touchDispatchedToTool = useRef(false)
  // Cached for getContainerPoint - see its comment.
  const containerRect = useRef<DOMRect | null>(null)

  // O1 (#41): mouse/pen press-and-hold gesture bookkeeping (touch has its own
  // path above and is left alone). capturedPointerId is the pointer whose
  // events the stage's content element has captured, so a release outside the
  // canvas still reaches handlePointerUp. gestureRect is the container's
  // client rect frozen at pointer-down: while a gesture is held, pointer
  // positions outside it are ignored, so the gesture always resolves at the
  // last in-canvas position instead of tracking the pointer over the
  // sidebars. lastGesture is that last in-canvas position, which is what a
  // release outside the canvas (or a lost capture) commits at.
  const capturedPointerId = useRef<number | null>(null)
  const gestureRect = useRef<DOMRect | null>(null)
  const lastGesture = useRef<{ pt: Point; mods: PointerModifiers } | null>(null)

  // Sync container size
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Expose the stage to non-canvas UI (e.g. menu bar export actions)
  useEffect(() => {
    setStage(stageRef.current)
    return () => setStage(null)
  }, [])

  // Keyboard: space for pan, tool key events
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      // Space-drag pan - SHORTCUTS['canvas.pan'] in keyboard/shortcuts.ts.
      if (e.code === 'Space') {
        isSpaceHeld.current = true
        e.preventDefault()
        return
      }
      if (matchesShortcut(e, 'drawing.cancel') && useUIStore.getState().pendingPlacementDefId) {
        useUIStore.getState().setPendingPlacement(null)
        return
      }
      TOOLS[activeTool]?.onKeyDown(e)
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') isSpaceHeld.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [activeTool])

  // We need a stable ref for view so event handlers don't capture stale
  // closures. Pointer handlers are memoized (below) and would otherwise keep a
  // stale view.x/view.y after a pan, since pixelsPerUnit only tracks scale.
  // Reading the live view here keeps screen<->world round-trips consistent so
  // the marquee and hit-tests stay glued to the cursor at any pan/zoom.
  const viewRef = useRef(view)
  viewRef.current = view

  // Container-relative screen position (no stage transform applied) to world
  // space: subtract the live pan offset and divide by the live pixels-per-unit.
  // Shared by getWorldPoint, tap-to-place, and drag-drop placement so the
  // projection math has one definition.
  const screenToWorld = useCallback((pos: Point): Point => {
    const v = viewRef.current
    const ppu = BASE_PIXELS_PER_UNIT * v.scale
    return { x: (pos.x - v.x) / ppu, y: (pos.y - v.y) / ppu }
  }, [])

  const snappedScreenToWorld = useCallback(
    (pos: Point): Point => {
      const worldRaw = screenToWorld(pos)
      return settings.snapToGrid
        ? snapToGrid(worldRaw, adaptiveGridSize(settings.gridSize, viewRef.current.scale))
        : worldRaw
    },
    [screenToWorld, settings],
  )

  // Holding Ctrl inverts the effective snap-to-grid setting for this pointer
  // event (snap on -> off, off -> on). Ctrl is used (not Shift) because Shift
  // is already used by SelectTool for marquee shift-add. Since the modifier
  // arrives on the same native PointerEvent that triggers this snap decision,
  // it's read directly here rather than tracked via a separate listener.
  // Listed in the cheat sheet as SHORTCUTS['canvas.snapInvert'].
  const getWorldPoint = useCallback(
    (e: KonvaEventObject<PointerEvent>): Point => {
      const stage = stageRef.current!
      const pos = stage.getPointerPosition()!
      const worldRaw = screenToWorld(pos)
      const wantsRaw = TOOLS[activeTool]?.wantsRawPointer?.() ?? false
      const effectiveSnap = e.evt.ctrlKey ? !settings.snapToGrid : settings.snapToGrid
      if (effectiveSnap && !wantsRaw) {
        const gridSpacing = adaptiveGridSize(settings.gridSize, viewRef.current.scale)
        return snapToGrid(worldRaw, gridSpacing)
      }
      return worldRaw
    },
    [activeTool, settings, screenToWorld],
  )

  function getModifiers(e: KonvaEventObject<PointerEvent>): PointerModifiers {
    return { shift: e.evt.shiftKey, ctrl: e.evt.ctrlKey }
  }

  // Container-relative position of a pointer event. Used for multi-touch
  // gesture math instead of stage.getPointerPosition(), which only tracks a
  // single position per event and can't distinguish two fingers.
  // getBoundingClientRect() forces a layout read, so it's cached for the
  // duration of a touch gesture (refreshed when the first finger goes down)
  // rather than queried on every pointermove.
  function getContainerPoint(e: KonvaEventObject<PointerEvent>): Point {
    if (!containerRect.current) containerRect.current = containerRef.current!.getBoundingClientRect()
    const rect = containerRect.current
    return { x: e.evt.clientX - rect.left, y: e.evt.clientY - rect.top }
  }

  // Live pixels-per-unit for tool dispatch, read from viewRef so hit-test
  // thresholds (which are px/ppu) match the current zoom even when the memoized
  // handlers haven't been recreated.
  const livePpu = () => BASE_PIXELS_PER_UNIT * viewRef.current.scale

  /** O1 (#41): ends whatever mouse/pen gesture is in flight as if the button
   * had been released at the last in-canvas position - a pan just stops, a
   * SelectTool drag/marquee commits through its normal onPointerUp (at most
   * one undo snapshot). Idempotent: with nothing in flight it does nothing,
   * so every path that can end a gesture (pointer-up, lost capture, cancel,
   * a stale pointer-down, a button-less pointer-move) can call it freely. */
  const endMouseGesture = useCallback(() => {
    capturedPointerId.current = null
    gestureRect.current = null
    const last = lastGesture.current
    lastGesture.current = null
    if (isPanning.current) {
      isPanning.current = false
      return
    }
    const { activeTool: tool, interactionMode } = useUIStore.getState()
    if (!last || interactionMode === 'idle') return
    TOOLS[tool]?.onPointerUp(last.pt, BASE_PIXELS_PER_UNIT * viewRef.current.scale, last.mods)
  }, [])

  // Whether a mouse/pen gesture (pan, drag, marquee) is currently held.
  function isGestureActive(): boolean {
    return isPanning.current || useUIStore.getState().interactionMode !== 'idle'
  }

  // True when a pointer event landed outside the container the gesture began
  // in (only reachable while the stage's content element holds capture).
  function isOutsideGestureRect(e: KonvaEventObject<PointerEvent>): boolean {
    const r = gestureRect.current
    if (!r) return false
    return e.evt.clientX < r.left || e.evt.clientX > r.right || e.evt.clientY < r.top || e.evt.clientY > r.bottom
  }

  // O1 (#41): a lost capture without a preceding pointer-up (element removed,
  // browser took the pointer back) must still end the gesture. After a normal
  // pointer-up handlePointerUp has already cleared capturedPointerId, so the
  // lostpointercapture the browser fires afterwards is a no-op.
  useEffect(() => {
    const content = stageRef.current?.content
    if (!content) return
    function onLostCapture(e: PointerEvent) {
      if (capturedPointerId.current === e.pointerId) endMouseGesture()
    }
    content.addEventListener('lostpointercapture', onLostCapture)
    return () => content.removeEventListener('lostpointercapture', onLostCapture)
  }, [endMouseGesture])

  /** Shared placement path for catalog drag-drop and tap-to-place: snapshot
   * for undo, create the instance at worldPt, select it. */
  const placeFurnitureAt = useCallback((defId: string, worldPt: Point) => {
    const def = resolveDefinition(defId)
    if (!def) return
    useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
    const instance = createFurnitureInstance(def, worldPt)
    useProjectStore.getState().addFurniture(instance)
    useUIStore.getState().setSelection([instance.id])
  }, [])

  const handlePointerDown = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (e.evt.pointerType === 'touch') {
        touchPoints.current.set(e.evt.pointerId, getContainerPoint(e))
        if (touchPoints.current.size === 2) {
          // Second finger down: this is a pan/pinch gesture, not a tool
          // action. If the first finger already reached the active tool,
          // let it undo whatever that stray pointer-down started.
          if (touchDispatchedToTool.current) {
            TOOLS[activeTool]?.onGestureCancel?.()
            touchDispatchedToTool.current = false
          }
          suppressTools.current = true
          isPanning.current = false
          const [p1, p2] = [...touchPoints.current.values()]
          pinchStart.current = {
            dist: distance(p1, p2),
            mid: midpoint(p1, p2),
            view: viewRef.current,
          }
          return
        }
        if (touchPoints.current.size > 2 || suppressTools.current) return
      } else if (suppressTools.current) {
        return
      }

      const button = e.evt.button
      if (e.evt.pointerType !== 'touch' && (button === 0 || button === 1)) {
        // O1 (#41): a pointer-down while a previous gesture is still open
        // means its pointer-up never arrived - close it out first so nothing
        // stale leaks into this one - then capture this pointer so *its*
        // pointer-up is delivered even when released outside the canvas.
        if (isGestureActive()) endMouseGesture()
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
        isPanning.current = true
        panAnchor.current = {
          clientX: e.evt.clientX,
          clientY: e.evt.clientY,
          vx: viewRef.current.x,
          vy: viewRef.current.y,
        }
        e.evt.preventDefault()
        return
      }
      if (button === 2) {
        TOOLS[activeTool]?.onRightClick()
        return
      }
      if (button === 0) {
        // Armed tap-to-place from the catalog takes priority over the active
        // tool: place the pending furniture at the tap point and disarm.
        const pendingDefId = useUIStore.getState().pendingPlacementDefId
        if (pendingDefId) {
          const pos = stageRef.current!.getPointerPosition()!
          placeFurnitureAt(pendingDefId, snappedScreenToWorld(pos))
          useUIStore.getState().setPendingPlacement(null)
          return
        }
        const worldPt = getWorldPoint(e)
        const rawWorldPt = screenToWorld(stageRef.current!.getPointerPosition()!)
        TOOLS[activeTool]?.onPointerDown(worldPt, rawWorldPt, livePpu(), getModifiers(e))
        if (e.evt.pointerType === 'touch') touchDispatchedToTool.current = true
        else lastGesture.current = { pt: worldPt, mods: getModifiers(e) }
      }
    },
    [activeTool, endMouseGesture, getWorldPoint, placeFurnitureAt, snappedScreenToWorld, screenToWorld],
  )

  const handlePointerMove = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (e.evt.pointerType === 'touch' && touchPoints.current.has(e.evt.pointerId)) {
        touchPoints.current.set(e.evt.pointerId, getContainerPoint(e))
        if (pinchStart.current && touchPoints.current.size >= 2) {
          // Two-finger gesture: anchored pinch-zoom around the fingers'
          // midpoint. All math is relative to the gesture's start state, so
          // a near-constant distance ratio degenerates into a pure pan.
          const [p1, p2] = [...touchPoints.current.values()]
          const dist = distance(p1, p2)
          const mid = midpoint(p1, p2)
          const start = pinchStart.current
          const ratio = start.dist > 0 ? dist / start.dist : 1
          const newScale = Math.min(10, Math.max(0.05, start.view.scale * ratio))
          const startPpu = BASE_PIXELS_PER_UNIT * start.view.scale
          const newPpu = BASE_PIXELS_PER_UNIT * newScale
          // keep the world point under the gesture's start midpoint glued to
          // the current midpoint
          const worldX = (start.mid.x - start.view.x) / startPpu
          const worldY = (start.mid.y - start.view.y) / startPpu
          setView({ x: mid.x - worldX * newPpu, y: mid.y - worldY * newPpu, scale: newScale })
          return
        }
        if (suppressTools.current) return
      } else if (e.evt.pointerType === 'touch' && suppressTools.current) {
        return
      }

      if (e.evt.pointerType !== 'touch' && touchPoints.current.size === 0 && isGestureActive()) {
        if (e.evt.buttons === 0) {
          // O1 (#41): a gesture is open but no button is down - its release
          // was missed. End it where it last was rather than letting hover
          // movement keep dragging the entity.
          endMouseGesture()
        } else if (!isPanning.current && isOutsideGestureRect(e)) {
          // Held gesture, pointer outside the canvas (capture keeps the
          // events coming): hold at the last in-canvas position.
          return
        }
      }

      if (isPanning.current) {
        const dx = e.evt.clientX - panAnchor.current.clientX
        const dy = e.evt.clientY - panAnchor.current.clientY
        setView({ ...viewRef.current, x: panAnchor.current.vx + dx, y: panAnchor.current.vy + dy })
        return
      }
      const worldPt = getWorldPoint(e)
      TOOLS[activeTool]?.onPointerMove(worldPt, livePpu(), getModifiers(e))
      if (e.evt.pointerType !== 'touch' && gestureRect.current) {
        lastGesture.current = { pt: worldPt, mods: getModifiers(e) }
      }
    },
    [activeTool, endMouseGesture, getWorldPoint, setView],
  )

  const handlePointerUp = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (e.evt.pointerType === 'touch') {
        touchPoints.current.delete(e.evt.pointerId)
        // Any finger lifting ends the pinch; suppression persists until the
        // last finger is up so the remaining finger can't start drawing.
        if (pinchStart.current) pinchStart.current = null
        if (touchPoints.current.size === 0) {
          containerRect.current = null
          const wasSuppressed = suppressTools.current
          suppressTools.current = false
          if (wasSuppressed) {
            touchDispatchedToTool.current = false
            return
          }
        } else if (suppressTools.current) {
          return
        }
        touchDispatchedToTool.current = false
      } else {
        // O1 (#41): this release is the one the capture was waiting for.
        const outside = isOutsideGestureRect(e)
        const last = lastGesture.current
        capturedPointerId.current = null
        gestureRect.current = null
        lastGesture.current = null
        if (isPanning.current) {
          isPanning.current = false
          return
        }
        if (e.evt.button === 0) {
          // Released outside the canvas: commit at the last in-canvas
          // position, exactly like a release there.
          const worldPt = outside && last ? last.pt : getWorldPoint(e)
          TOOLS[activeTool]?.onPointerUp(worldPt, livePpu(), getModifiers(e))
        }
        return
      }

      if (isPanning.current) {
        isPanning.current = false
        return
      }
      if (e.evt.button === 0) {
        const worldPt = getWorldPoint(e)
        TOOLS[activeTool]?.onPointerUp(worldPt, livePpu(), getModifiers(e))
      }
    },
    [activeTool, getWorldPoint],
  )

  const handlePointerCancel = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (e.evt.pointerType !== 'touch') {
        // O1 (#41): the browser took the pointer away; resolve the gesture at
        // its last in-canvas position rather than leaving it half-finished.
        endMouseGesture()
        return
      }
      touchPoints.current.delete(e.evt.pointerId)
      pinchStart.current = null
      if (touchDispatchedToTool.current) {
        TOOLS[activeTool]?.onGestureCancel?.()
        touchDispatchedToTool.current = false
      }
      if (touchPoints.current.size === 0) {
        suppressTools.current = false
        containerRect.current = null
      }
    },
    [activeTool, endMouseGesture],
  )

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const defId = e.dataTransfer.getData('application/mover-furniture')
    if (!defId) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top }

    placeFurnitureAt(defId, snappedScreenToWorld(pos))
  }

  // Scroll zooms at the cursor - SHORTCUTS['canvas.zoom'].
  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newScale = Math.min(10, Math.max(0.05, view.scale * zoomFactor))
    const newPpu = BASE_PIXELS_PER_UNIT * newScale
    const oldPpu = BASE_PIXELS_PER_UNIT * view.scale
    // cursor position relative to container
    const cursorX = e.nativeEvent.offsetX
    const cursorY = e.nativeEvent.offsetY
    // keep the world point under the cursor fixed
    const worldX = (cursorX - view.x) / oldPpu
    const worldY = (cursorY - view.y) / oldPpu
    setView({ x: cursorX - worldX * newPpu, y: cursorY - worldY * newPpu, scale: newScale })
  }

  // Cursor style based on active tool and panning state
  const cursorStyle =
    activeTool === 'room' || activeTool === 'interiorWall' ? 'crosshair' : 'default'

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ background: backgroundColor, cursor: cursorStyle }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        {showGrid && (
          <GridLayer
            pixelsPerUnit={pixelsPerUnit}
            gridSize={settings.gridSize}
            viewX={view.x}
            viewY={view.y}
            zoom={view.scale}
            width={size.width}
            height={size.height}
            units={settings.units}
            rulerMode={settings.rulerMode}
          />
        )}
        <ReferenceImageLayer pixelsPerUnit={pixelsPerUnit} />
        <RoomLayer pixelsPerUnit={pixelsPerUnit} />
        <InteriorWallLayer pixelsPerUnit={pixelsPerUnit} units={settings.units} />
        <HighlightLayer pixelsPerUnit={pixelsPerUnit} />
        <FurnitureLayer pixelsPerUnit={pixelsPerUnit} />
        <AnnotationLayer />
        <SelectionLayer pixelsPerUnit={pixelsPerUnit} units={settings.units} />
      </Stage>
      <Rulers
        pixelsPerUnit={pixelsPerUnit}
        gridSize={settings.gridSize}
        viewX={view.x}
        viewY={view.y}
        zoom={view.scale}
        width={size.width}
        height={size.height}
        units={settings.units}
        rulerMode={settings.rulerMode}
      />
      <FlowIndicator />
      <DrawingControls />
    </div>
  )
}
