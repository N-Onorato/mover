import { useRef, useEffect, useState, useCallback } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Stage } from 'react-konva'
import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../store/uiStore'
import { GridLayer } from './layers/GridLayer'
import { ReferenceImageLayer } from './layers/ReferenceImageLayer'
import { RoomLayer } from './layers/RoomLayer'
import { HighlightLayer } from './layers/HighlightLayer'
import { FurnitureLayer } from './layers/FurnitureLayer'
import { AnnotationLayer } from './layers/AnnotationLayer'
import { SelectionLayer } from './layers/SelectionLayer'
import { Rulers } from './Rulers'
import { SelectTool } from './tools/SelectTool'
import { RoomTool } from './tools/RoomTool'
import { FurnitureTool } from './tools/FurnitureTool'
import { ImageTool } from './tools/ImageTool'
import { AnnotationTool } from './tools/AnnotationTool'
import type { ToolHandlers } from './tools/SelectTool'
import type { Point } from '../types/project'
import { snapToGrid } from '../utils/snap'
import { adaptiveGridSize } from '../utils/snap'
import { setStage } from './stageRegistry'
import styles from './LayoutCanvas.module.css'

const BASE_PIXELS_PER_UNIT = 10

const TOOLS: Record<string, ToolHandlers> = {
  select: SelectTool,
  room: RoomTool,
  furniture: FurnitureTool,
  image: ImageTool,
  annotation: AnnotationTool,
}

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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        isSpaceHeld.current = true
        e.preventDefault()
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

  function getWorldPoint(_e: KonvaEventObject<MouseEvent>): Point {
    const stage = stageRef.current!
    const pos = stage.getPointerPosition()!
    // stage.getPointerPosition() is relative to the container; subtract pan offset
    const stageLocalX = pos.x - view.x
    const stageLocalY = pos.y - view.y
    const worldRaw: Point = { x: stageLocalX / pixelsPerUnit, y: stageLocalY / pixelsPerUnit }
    if (settings.snapToGrid) {
      const gridSpacing = adaptiveGridSize(settings.gridSize, view.scale)
      return snapToGrid(worldRaw, gridSpacing)
    }
    return worldRaw
  }

  // We need a stable ref for view so event handlers don't capture stale closures
  const viewRef = useRef(view)
  viewRef.current = view

  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const button = e.evt.button
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
        const worldPt = getWorldPoint(e)
        TOOLS[activeTool]?.onPointerDown(worldPt, pixelsPerUnit)
      }
    },
    [activeTool, pixelsPerUnit, settings],
  )

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (isPanning.current) {
        const dx = e.evt.clientX - panAnchor.current.clientX
        const dy = e.evt.clientY - panAnchor.current.clientY
        setView({ ...viewRef.current, x: panAnchor.current.vx + dx, y: panAnchor.current.vy + dy })
        return
      }
      const worldPt = getWorldPoint(e)
      TOOLS[activeTool]?.onPointerMove(worldPt, pixelsPerUnit)
    },
    [activeTool, pixelsPerUnit, settings, setView],
  )

  const handleMouseUp = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (isPanning.current) {
        isPanning.current = false
        return
      }
      if (e.evt.button === 0) {
        TOOLS[activeTool]?.onPointerUp({ x: 0, y: 0 }, pixelsPerUnit)
      }
    },
    [activeTool, pixelsPerUnit],
  )

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
  const cursorStyle = activeTool === 'room' ? 'crosshair' : 'default'

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onWheel={handleWheel}
      style={{ background: backgroundColor, cursor: cursorStyle }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
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
          />
        )}
        <ReferenceImageLayer pixelsPerUnit={pixelsPerUnit} />
        <RoomLayer pixelsPerUnit={pixelsPerUnit} />
        <HighlightLayer pixelsPerUnit={pixelsPerUnit} />
        <FurnitureLayer pixelsPerUnit={pixelsPerUnit} />
        <AnnotationLayer />
        <SelectionLayer pixelsPerUnit={pixelsPerUnit} />
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
      />
    </div>
  )
}
