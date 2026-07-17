import { create } from 'zustand'
import type { Point } from '../types/project'

export type Tool = 'select' | 'room' | 'interiorWall' | 'image' | 'annotation'

export interface ViewState {
  x: number
  y: number
  scale: number
}

// Pan offset so world (0,0) lands a bit in from the container's top-left
// corner instead of exactly under the ruler corner box, where it's
// invisible on a fresh load. RULER_THICKNESS (canvas/Rulers.tsx) clears the
// ruler overlay; the rest leaves ~1ft of world space visible above/left of
// the origin at the default 10px/ft (BASE_PIXELS_PER_UNIT) scale.
export const DEFAULT_VIEW: ViewState = { x: 30, y: 30, scale: 1 }

export interface RoomDrawingState {
  kind: 'room'
  points: Point[]       // committed vertices in world space
  cursor: Point | null  // current cursor in world space (snapped)
}

export interface CalibrationDrawingState {
  kind: 'calibration'
  imageId: string
  points: Point[]       // 0, 1, or 2 committed points in world space
  cursor: Point | null  // current cursor in world space
}

export interface ImageOriginDrawingState {
  kind: 'imageOrigin'
  imageId: string
  cursor: Point | null  // current cursor in world space
}

export interface InteriorWallDrawingState {
  kind: 'interiorWall'
  roomId: string
  a: Point        // committed (snapped) start point in world space
  cursor: Point | null  // current cursor in world space (snap-previewed)
}

export type DrawingState =
  | RoomDrawingState
  | CalibrationDrawingState
  | ImageOriginDrawingState
  | InteriorWallDrawingState

export interface SelectedWall {
  roomId: string
  edgeIndex: number
}

export interface MarqueeState {
  start: Point // world space
  end: Point // world space
  additive: boolean // shift-drag: add to existing selection instead of replacing it
}

export interface WallDragState {
  kind: 'wall'
  roomId: string
  edgeIndex: number
  originalPoints: Point[] // room.points snapshot at drag start
  currentPoints: Point[] // live-updated preview during drag
}

export interface VertexDragState {
  kind: 'vertex'
  roomId: string
  vertexIndex: number
  originalPoints: Point[]
  currentPoints: Point[]
}

export interface InteriorWallEndpointDragState {
  kind: 'interiorWallEndpoint'
  wallId: string
  which: 'a' | 'b'
  originalA: Point
  originalB: Point
  currentA: Point
  currentB: Point
}

export interface FurnitureResizeDragState {
  kind: 'furnitureResize'
  id: string
  corner: 0 | 1 | 2 | 3 // index into rectPoints(x,y,w,h) order: TL,TR,BR,BL
  rotation: number // fixed for the duration of the resize
  originalX: number
  originalY: number
  originalWidth: number
  originalDepth: number
  currentX: number
  currentY: number
  currentWidth: number
  currentDepth: number
}

export interface FurnitureRotateDragState {
  kind: 'furnitureRotate'
  id: string
  center: Point
  originalRotation: number
  currentRotation: number
}

/** The single rigid-translation drag path for rooms, furniture, and interior
 * walls: dragging any selected room/furniture/interior-wall body moves every
 * selected item of every type together (a lone selected item is just the
 * one-element case), preserving relative positions. Interior walls anchored
 * to a selected room ride along automatically even when not themselves
 * selected. Shape/rotation edits (vertex, wall-edge, furniture resize/rotate,
 * interior-wall endpoint) aren't rigid translations and keep their own
 * dedicated drag states below instead of folding into this one. */
export interface MultiDragState {
  kind: 'multi'
  roomIds: string[]
  originalRoomPointsById: Record<string, Point[]>
  currentRoomPointsById: Record<string, Point[]>
  furnitureIds: string[]
  originalFurniturePosById: Record<string, Point>
  currentFurniturePosById: Record<string, Point>
  wallIds: string[]
  originalWallById: Record<string, { a: Point; b: Point }>
  currentWallById: Record<string, { a: Point; b: Point }>
}

export type DragState =
  | WallDragState
  | VertexDragState
  | InteriorWallEndpointDragState
  | FurnitureResizeDragState
  | FurnitureRotateDragState
  | MultiDragState

/** SelectTool's interaction state machine. Lives in the store (rather than a
 * tool-module-level `let`) so it's inspectable and can't drift out of sync
 * with re-renders. */
export type InteractionMode =
  | 'idle'
  | 'marquee'
  | 'wall'
  | 'vertex'
  | 'interiorWallEndpoint'
  | 'furnitureResize'
  | 'furnitureRotate'
  | 'multi'

interface UIStore {
  activeTool: Tool
  selectedIds: string[]
  selectedWall: SelectedWall | null
  showGrid: boolean
  drawingState: DrawingState | null
  marquee: MarqueeState | null
  dragState: DragState | null
  interactionMode: InteractionMode
  dragAnchorWorld: Point | null
  /** Catalog definition armed for tap-to-place: the next canvas click/tap
   * places this furniture instead of dispatching to the active tool. The
   * touch-friendly alternative to HTML5 drag-and-drop (which never fires on
   * touchscreens). */
  pendingPlacementDefId: string | null
  showWallLabels: boolean
  showLayers: {
    referenceImages: boolean
    rooms: boolean
    furniture: boolean
    annotations: boolean
  }
  lockedLayers: {
    referenceImages: boolean
    rooms: boolean
    furniture: boolean
    annotations: boolean
  }
  view: ViewState

  setActiveTool: (tool: Tool) => void
  setSelection: (ids: string[]) => void
  addToSelection: (id: string) => void
  clearSelection: () => void
  setSelectedWall: (wall: SelectedWall | null) => void
  toggleGrid: () => void
  setDrawingState: (state: DrawingState | null) => void
  setMarquee: (marquee: MarqueeState | null) => void
  setDragState: (dragState: DragState | null) => void
  setInteractionMode: (mode: InteractionMode) => void
  setDragAnchorWorld: (pt: Point | null) => void
  setPendingPlacement: (defId: string | null) => void
  toggleWallLabels: () => void
  toggleLayerVisibility: (layer: keyof UIStore['showLayers']) => void
  toggleLayerLock: (layer: keyof UIStore['lockedLayers']) => void
  setView: (view: ViewState) => void
}

/** Idle-state label shown for each tool when no operation is in progress. */
export const TOOL_LABELS: Record<Tool, string> = {
  select: 'Select',
  room: 'Room',
  interiorWall: 'Interior Wall',
  image: 'Image',
  annotation: 'Annotation',
}

/**
 * Derives a short status-bar hint for the active tool, taking any
 * in-progress drawingState into account. Purely a read-only helper over
 * existing state — safe to call from any component.
 */
export function getToolHint(
  activeTool: Tool,
  drawingState: DrawingState | null,
  pendingPlacementName?: string | null,
): string {
  if (pendingPlacementName) {
    return `Place: click or tap the canvas to place ${pendingPlacementName} (Esc to cancel)`
  }
  if (drawingState?.kind === 'room') {
    return drawingState.points.length < 3
      ? 'Room: click to add point'
      : 'Room: click to add point, double-click or click first point to close'
  }
  if (drawingState?.kind === 'calibration') {
    return drawingState.points.length === 0
      ? 'Calibration: click first point'
      : 'Calibration: click second point'
  }
  if (drawingState?.kind === 'imageOrigin') {
    return 'Image: click to place the top-left corner'
  }
  if (drawingState?.kind === 'interiorWall') {
    return 'Interior Wall: click to place the second point'
  }
  switch (activeTool) {
    case 'select':
      return 'Select: click to select, drag to marquee-select'
    case 'room':
      return 'Room: click to start drawing'
    case 'interiorWall':
      return 'Interior Wall: click a point inside a room to start'
    case 'image':
      return 'Image: import a photo, then calibrate its scale'
    case 'annotation':
      return 'Annotation: click to place label'
    default:
      return TOOL_LABELS[activeTool] ?? ''
  }
}

export const useUIStore = create<UIStore>((set) => ({
  activeTool: 'select',
  selectedIds: [],
  selectedWall: null,
  showGrid: true,
  drawingState: null,
  marquee: null,
  dragState: null,
  interactionMode: 'idle',
  dragAnchorWorld: null,
  pendingPlacementDefId: null,
  showWallLabels: true,
  showLayers: {
    referenceImages: true,
    rooms: true,
    furniture: true,
    annotations: true,
  },
  lockedLayers: {
    referenceImages: true,
    rooms: false,
    furniture: false,
    annotations: false,
  },
  view: DEFAULT_VIEW,

  setActiveTool: (tool) =>
    set({
      activeTool: tool,
      selectedIds: [],
      selectedWall: null,
      drawingState: null,
      marquee: null,
      dragState: null,
      interactionMode: 'idle',
      dragAnchorWorld: null,
      pendingPlacementDefId: null,
    }),
  setSelection: (ids) => set({ selectedIds: ids, selectedWall: null }),
  addToSelection: (id) => set((s) => ({ selectedIds: [...s.selectedIds, id] })),
  clearSelection: () => set({ selectedIds: [], selectedWall: null }),
  setSelectedWall: (wall) => set({ selectedWall: wall }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setDrawingState: (state) => set({ drawingState: state }),
  setMarquee: (marquee) => set({ marquee }),
  setDragState: (dragState) => set({ dragState }),
  setInteractionMode: (mode) => set({ interactionMode: mode }),
  setDragAnchorWorld: (pt) => set({ dragAnchorWorld: pt }),
  setPendingPlacement: (defId) => set({ pendingPlacementDefId: defId }),
  toggleWallLabels: () => set((s) => ({ showWallLabels: !s.showWallLabels })),
  toggleLayerVisibility: (layer) =>
    set((s) => ({
      showLayers: { ...s.showLayers, [layer]: !s.showLayers[layer] },
    })),
  toggleLayerLock: (layer) =>
    set((s) => ({
      lockedLayers: { ...s.lockedLayers, [layer]: !s.lockedLayers[layer] },
    })),
  setView: (view) => set({ view }),
}))
