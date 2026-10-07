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
import type { PointerModifiers } from './tools/types'
import type { Point } from '../types/project'
import { pixelsPerUnitFor } from '../utils/scale'
import { setStage } from './stageRegistry'
import { isTypingTarget, matchesShortcut } from '../keyboard/shortcuts'
import { toWorld, toWorldPerSetting, pointerToWorld, livePixelsPerUnit } from './pointerToWorld'
import { useMouseGestures } from './useMouseGestures'
import { useTouchGestures } from './useTouchGestures'
import styles from './LayoutCanvas.module.css'

/** Handlers for the active tool, read live so callbacks never close over a stale tool. */
function activeTool() {
  return TOOLS[useUIStore.getState().activeTool]
}

function cancelActiveToolGesture() {
  activeTool().onGestureCancel?.()
}

function getModifiers(e: KonvaEventObject<PointerEvent>): PointerModifiers {
  return { shift: e.evt.shiftKey, ctrl: e.evt.ctrlKey }
}

/** Shared placement path for catalog drag-drop and tap-to-place: snapshot
 * for undo, create the instance at worldPt, select it. */
function placeFurnitureAt(defId: string, worldPt: Point) {
  const def = resolveDefinition(defId)
  if (!def) return
  useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
  const instance = createFurnitureInstance(def, worldPt)
  useProjectStore.getState().addFurniture(instance)
  useUIStore.getState().setSelection([instance.id])
}

export function LayoutCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const view = useUIStore((s) => s.view)
  const toolId = useUIStore((s) => s.activeTool)
  const showGrid = useUIStore((s) => s.showGrid)
  const settings = useProjectStore((s) => s.project.settings)

  const pixelsPerUnit = pixelsPerUnitFor(view.scale)

  const mouse = useMouseGestures(stageRef, containerRef)
  const touch = useTouchGestures(containerRef, cancelActiveToolGesture)
  const { isSpaceHeld } = mouse

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
      activeTool().onKeyDown(e)
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
  }, [isSpaceHeld])

  const handlePointerDown = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      // Konva's canvas isn't a native focusable element, so clicking it never
      // blurs a focused input on its own. Without this, document.activeElement
      // stays on a PropertiesPanel field after the user clicks the canvas, and
      // every subsequent keydown (Delete/Backspace) keeps getting swallowed by
      // the "don't hijack typing" guards in MenuBar/LayoutCanvas keydown handlers.
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        active.blur()
      }
      if (touch.onDown(e)) {
        // A second finger turns this into a pinch, which supersedes any pan.
        if (e.evt.pointerType === 'touch') mouse.endPan()
        return
      }
      if (mouse.onDown(e)) return

      const button = e.evt.button
      if (button === 2) {
        activeTool().onRightClick()
        return
      }
      if (button === 0) {
        const stage = stageRef.current!
        const pos = stage.getPointerPosition()!
        // Armed tap-to-place from the catalog takes priority over the active
        // tool: place the pending furniture at the tap point and disarm.
        const pendingDefId = useUIStore.getState().pendingPlacementDefId
        if (pendingDefId) {
          placeFurnitureAt(pendingDefId, toWorldPerSetting(pos))
          useUIStore.getState().setPendingPlacement(null)
          return
        }
        const worldPt = pointerToWorld(e, stage)
        const mods = getModifiers(e)
        activeTool().onPointerDown(worldPt, toWorld(pos, false), livePixelsPerUnit(), mods)
        touch.onToolDispatched(e)
        mouse.recordToolPoint(e, worldPt, mods)
      }
    },
    [touch, mouse],
  )

  const handlePointerMove = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (touch.onMove(e)) return
      if (mouse.onMove(e, touch.hasTouches())) return
      const worldPt = pointerToWorld(e, stageRef.current!)
      const mods = getModifiers(e)
      activeTool().onPointerMove(worldPt, livePixelsPerUnit(), mods)
      mouse.recordToolPoint(e, worldPt, mods)
    },
    [touch, mouse],
  )

  const handlePointerUp = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (touch.onUp(e)) return
      // Released outside the canvas: commit at the last in-canvas position,
      // exactly like a release there.
      const outsidePt = mouse.release(e)
      if (mouse.endPan()) return
      if (e.evt.button === 0) {
        const worldPt = outsidePt ?? pointerToWorld(e, stageRef.current!)
        activeTool().onPointerUp(worldPt, livePixelsPerUnit(), getModifiers(e))
      }
    },
    [touch, mouse],
  )

  const handlePointerCancel = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      // Mouse/pen: the browser took the pointer away; resolve the gesture at
      // its last in-canvas position rather than leaving it half-finished.
      if (!touch.onCancel(e)) mouse.endGesture()
    },
    [touch, mouse],
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

    placeFurnitureAt(defId, toWorldPerSetting(pos))
  }

  const cursorStyle = toolId === 'room' || toolId === 'interiorWall' ? 'crosshair' : 'default'

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onWheel={mouse.handleWheel}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ background: settings.backgroundColor, cursor: cursorStyle }}
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
        <FurnitureLayer pixelsPerUnit={pixelsPerUnit} />
        <HighlightLayer pixelsPerUnit={pixelsPerUnit} />
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
