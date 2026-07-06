import { create } from 'zustand'
import type { Point } from '../types/project'

export type Tool = 'select' | 'room' | 'furniture' | 'image' | 'annotation'

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

export type DrawingState = RoomDrawingState

interface UIStore {
  activeTool: Tool
  selectedIds: string[]
  showGrid: boolean
  drawingState: DrawingState | null
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
  toggleGrid: () => void
  setDrawingState: (state: DrawingState | null) => void
  toggleLayerVisibility: (layer: keyof UIStore['showLayers']) => void
  toggleLayerLock: (layer: keyof UIStore['lockedLayers']) => void
  setView: (view: ViewState) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeTool: 'select',
  selectedIds: [],
  showGrid: true,
  drawingState: null,
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

  setActiveTool: (tool) => set({ activeTool: tool, selectedIds: [], drawingState: null }),
  setSelection: (ids) => set({ selectedIds: ids }),
  addToSelection: (id) => set((s) => ({ selectedIds: [...s.selectedIds, id] })),
  clearSelection: () => set({ selectedIds: [] }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setDrawingState: (state) => set({ drawingState: state }),
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
