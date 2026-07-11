import { create } from 'zustand'
import type { Project } from '../types/project'

const MAX_HISTORY = 50

interface HistoryStore {
  past: Project[]
  future: Project[]

  pushSnapshot: (project: Project) => void
  undo: (current: Project) => Project | null
  redo: (current: Project) => Project | null
  clear: () => void
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],

  // Call once per user gesture (on pointer-down/commit), not per pointer-move frame —
  // see RoomTool.commitRoom and PropertiesPanel.useSnapshotOnFocus for the pattern.
  pushSnapshot: (project) =>
    set((s) => ({
      past: [...s.past.slice(-MAX_HISTORY + 1), project],
      future: [],
    })),

  undo: (current) => {
    const { past } = get()
    if (past.length === 0) return null
    const previous = past[past.length - 1]
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [current, ...s.future],
    }))
    return previous
  },

  redo: (current) => {
    const { future } = get()
    if (future.length === 0) return null
    const next = future[0]
    set((s) => ({
      past: [...s.past, current],
      future: s.future.slice(1),
    }))
    return next
  },

  clear: () => set({ past: [], future: [] }),
}))
