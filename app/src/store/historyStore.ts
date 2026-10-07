import { create } from 'zustand'
import type { Project } from '../types/project'

const MAX_HISTORY = 50

interface HistoryStore {
  past: Project[]
  future: Project[]

  pushSnapshot: (project: Project) => void
  popSnapshot: () => void
  undo: (current: Project) => Project | null
  redo: (current: Project) => Project | null
  clear: () => void
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],

  // Call once per user gesture (on pointer-down/commit), not per pointer-move frame —
  // see RoomTool.commitRoom and hooks/useSnapshotOnce for the pattern.
  pushSnapshot: (project) =>
    set((s) => ({
      past: [...s.past.slice(-MAX_HISTORY + 1), project],
      future: [],
    })),

  // Discards the most recent snapshot without restoring it — for an action
  // that snapshotted optimistically and then undid its own effect (the image
  // import flow pushes before adding the image, then deletes the image again
  // if the user cancels mid-flow). Without this, cancelling would leave an
  // undo step that appears to do nothing.
  //
  // Note pushSnapshot already cleared `future`, so a cancelled action still
  // costs the redo stack. That matches any other edit and isn't worth
  // special-casing.
  popSnapshot: () => set((s) => ({ past: s.past.slice(0, -1) })),

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
