import { create } from 'zustand'
import type { FurnitureDefinition, Project } from '../types/project'
import { useUIStore } from './uiStore'
import {
  EMPTY_LIBRARY,
  LIBRARY_STORAGE_KEY,
  deletePiece,
  deleteSet,
  libraryFromProject,
  mergeLibraries,
  parseLibrary,
  renamePiece,
  renameSet,
  savePiece,
  serializeLibrary,
  createSet as createSetIn,
  type FurnitureLibrary,
} from '../furniture/library'

/** The user's saved furniture sets.
 *
 * Deliberately outside the Project: the library is shared by every project in
 * this browser, so it is not covered by historyStore snapshots and library
 * edits are NOT undoable. Destructive actions (deleting a set or piece,
 * overwriting a piece) therefore confirm at the call site instead.
 *
 * Persistence writes localStorage on every mutation. Unlike the project
 * autosave, a failed write is reported rather than swallowed: the autosave
 * retries a second later, but a library write happens once, right after the
 * user clicked Save, and the autosave's base64 reference images can fill the
 * origin's quota. `persistError` is what the Sets tab says so out loud.
 *
 * The store starts empty and App hydrates it on mount, so importing this
 * module never touches localStorage - which keeps it usable from vitest's
 * node environment.
 */
interface LibraryStore {
  library: FurnitureLibrary
  /** The last write to localStorage failed - the library is in memory (and
   * still embedded in saved project files) but won't survive a reload. */
  persistError: boolean
  setLibrary: (library: FurnitureLibrary) => void
  hydrate: () => void
  mergeFromProject: (project: Project) => void
  createSet: (name: string) => string
  renameSet: (setId: string, name: string) => void
  deleteSet: (setId: string) => void
  savePiece: (piece: FurnitureDefinition) => void
  renamePiece: (pieceId: string, name: string) => void
  deletePiece: (pieceId: string) => void
}

function persist(library: FurnitureLibrary): boolean {
  try {
    localStorage.setItem(LIBRARY_STORAGE_KEY, serializeLibrary(library))
    return true
  } catch {
    // Quota exceeded, or storage unavailable (node, private mode). The
    // in-memory library keeps working either way.
    return false
  }
}

function readStoredLibrary(): FurnitureLibrary {
  try {
    return parseLibrary(localStorage.getItem(LIBRARY_STORAGE_KEY))
  } catch {
    return EMPTY_LIBRARY
  }
}

export const useLibraryStore = create<LibraryStore>((set, get) => {
  /** Every mutation goes through here so no path can update the store without
   * writing it back to localStorage. */
  const commit = (next: FurnitureLibrary) => {
    set({ library: next, persistError: !persist(next) })
  }

  /** A piece can be armed for tap-to-place when it is deleted. Left armed,
   * the next canvas tap silently does nothing (placeFurnitureAt early-returns
   * on an id it can't resolve) and the status bar shows a nameless hint.
   *
   * Only a piece that this deletion removed is disarmed: an armed built-in
   * catalog item is never in `pieces` and must be left alone. */
  const disarmDeletedPlacement = (before: FurnitureLibrary, after: FurnitureLibrary) => {
    const armed = useUIStore.getState().pendingPlacementDefId
    if (!armed) return
    const wasInLibrary = before.pieces.some((p) => p.id === armed)
    const stillInLibrary = after.pieces.some((p) => p.id === armed)
    if (wasInLibrary && !stillInLibrary) useUIStore.getState().setPendingPlacement(null)
  }

  return {
    library: EMPTY_LIBRARY,
    persistError: false,

    setLibrary: (library) => commit(library),
    hydrate: () => set({ library: readStoredLibrary() }),

    mergeFromProject: (project) => {
      const incoming = libraryFromProject(project)
      if (incoming.sets.length === 0 && incoming.pieces.length === 0) return
      commit(mergeLibraries(get().library, incoming))
    },

    createSet: (name) => {
      const { library, set: created } = createSetIn(get().library, name)
      commit(library)
      return created.id
    },
    renameSet: (setId, name) => commit(renameSet(get().library, setId, name)),
    deleteSet: (setId) => {
      const before = get().library
      const next = deleteSet(before, setId)
      commit(next)
      disarmDeletedPlacement(before, next)
    },

    savePiece: (piece) => commit(savePiece(get().library, piece)),
    renamePiece: (pieceId, name) => commit(renamePiece(get().library, pieceId, name)),
    deletePiece: (pieceId) => {
      const before = get().library
      const next = deletePiece(before, pieceId)
      commit(next)
      disarmDeletedPlacement(before, next)
    },
  }
})
