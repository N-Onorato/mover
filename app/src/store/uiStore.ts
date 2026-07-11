import { create } from 'zustand'
import type { Point } from '../types/project'

export type Tool = 'select' | 'room' | 'image' | 'annotation'

export interface ViewState {
  x: number
  y: number
  scale: number
}

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

export type DrawingState = RoomDrawingState | CalibrationDrawingState | ImageOriginDrawingState

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

export interface RoomDragState {
  kind: 'room'
  roomIds: string[] // all rooms being dragged together (single room, or a multi-select)
  originalPointsById: Record<string, Point[]> // room.points snapshot at drag start, keyed by room id
  currentPointsById: Record<string, Point[]> // live-updated preview during drag, keyed by room id
}

export type DragState = WallDragState | VertexDragState | RoomDragState

/** SelectTool's interaction state machine. Lives in the store (rather than a
 * tool-module-level `let`) so it's inspectable and can't drift out of sync
 * with re-renders. */
export type InteractionMode = 'idle' | 'marquee' | 'wall' | 'vertex' | 'room'

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
  toggleWallLabels: () => void
  toggleLayerVisibility: (layer: keyof UIStore['showLayers']) => void
  toggleLayerLock: (layer: keyof UIStore['lockedLayers']) => void
  setView: (view: ViewState) => void
}

/** Idle-state label shown for each tool when no operation is in progress. */
export const TOOL_LABELS: Record<Tool, string> = {
  select: 'Select',
  room: 'Room',
  image: 'Image',
  annotation: 'Annotation',
}

/**
 * Derives a short status-bar hint for the active tool, taking any
 * in-progress drawingState into account. Purely a read-only helper over
 * existing state — safe to call from any component.
 */
export function getToolHint(activeTool: Tool, drawingState: DrawingState | null): string {
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
  switch (activeTool) {
    case 'select':
      return 'Select: click to select, drag to marquee-select'
    case 'room':
      return 'Room: click to start drawing'
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
  view: { x: 0, y: 0, scale: 1 },

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
