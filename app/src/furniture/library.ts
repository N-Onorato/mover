import type {
  FurnitureDefinition,
  FurnitureInstance,
  FurnitureSet,
  Project,
} from '../types/project'
import { findDefinition } from './catalog'

/** The user's furniture library: named sets and the pieces filed under them.
 *
 * A "piece" is a FurnitureDefinition the user saved from a placed item, so it
 * carries that item's width, depth, color and name. Membership lives on the
 * piece (`setId`) rather than nesting pieces inside sets, which keeps
 * definition lookup a single flat search and lets a piece survive its set
 * being deleted from another tab (it shows under "Ungrouped").
 *
 * The library is stored twice: once in localStorage, shared by every project
 * in this browser, and once inside each saved project file so a shared
 * `.mover.json` still renders its own pieces. Opening a project merges its
 * copy back in - see `mergeLibraries`.
 */
export interface FurnitureLibrary {
  version: 1
  sets: FurnitureSet[]
  pieces: FurnitureDefinition[]
}

export const LIBRARY_STORAGE_KEY = 'mover:furniture-library'

export const EMPTY_LIBRARY: FurnitureLibrary = { version: 1, sets: [], pieces: [] }

export function createSet(
  library: FurnitureLibrary,
  name: string,
): { library: FurnitureLibrary; set: FurnitureSet } {
  const set: FurnitureSet = { id: crypto.randomUUID(), name: name.trim() }
  return { library: { ...library, sets: [...library.sets, set] }, set }
}

export function renameSet(
  library: FurnitureLibrary,
  setId: string,
  name: string,
): FurnitureLibrary {
  return {
    ...library,
    sets: library.sets.map((s) => (s.id === setId ? { ...s, name: name.trim() } : s)),
  }
}

/** Deleting a set takes its pieces with it - a set is how the user filed them,
 * not a view over an independent list. */
export function deleteSet(library: FurnitureLibrary, setId: string): FurnitureLibrary {
  return {
    version: 1,
    sets: library.sets.filter((s) => s.id !== setId),
    pieces: library.pieces.filter((p) => p.setId !== setId),
  }
}

/** Add a piece, or replace the existing one with the same id (the "update an
 * existing piece" path in the save dialog). */
export function savePiece(
  library: FurnitureLibrary,
  piece: FurnitureDefinition,
): FurnitureLibrary {
  const exists = library.pieces.some((p) => p.id === piece.id)
  return {
    ...library,
    pieces: exists
      ? library.pieces.map((p) => (p.id === piece.id ? piece : p))
      : [...library.pieces, piece],
  }
}

export function renamePiece(
  library: FurnitureLibrary,
  pieceId: string,
  name: string,
): FurnitureLibrary {
  return {
    ...library,
    pieces: library.pieces.map((p) => (p.id === pieceId ? { ...p, name: name.trim() } : p)),
  }
}

export function deletePiece(library: FurnitureLibrary, pieceId: string): FurnitureLibrary {
  return { ...library, pieces: library.pieces.filter((p) => p.id !== pieceId) }
}

/** Capture a placed item as a reusable piece. `id` is passed in when
 * overwriting an existing piece, so the pieces filed in a set keep their
 * identity (and any instance already referencing them keeps resolving). */
export function pieceFromInstance(
  instance: FurnitureInstance,
  name: string,
  setId: string | undefined,
  id: string = crypto.randomUUID(),
): FurnitureDefinition {
  return {
    id,
    name: name.trim(),
    // User pieces aren't filed under a built-in category; their color is
    // saved explicitly, which is all `category` drove for an instance.
    category: 'other',
    width: instance.width,
    depth: instance.depth,
    shape: { type: 'rect' },
    tags: [],
    builtIn: false,
    fillColor: instance.fillColor,
    setId,
  }
}

/** Union by id with `base` winning every collision. Used when a project file
 * is opened: the browser library is the source of truth (it is the copy the
 * user has been editing), and the file only contributes sets and pieces this
 * browser has never seen. Merging the same file twice is a no-op.
 *
 * Sets are never deduped by name: two sets both called "Living Room" are two
 * sets, and fusing unrelated libraries by name would lose pieces. */
export function mergeLibraries(
  base: FurnitureLibrary,
  incoming: FurnitureLibrary,
): FurnitureLibrary {
  const setIds = new Set(base.sets.map((s) => s.id))
  const pieceIds = new Set(base.pieces.map((p) => p.id))
  return {
    version: 1,
    sets: [...base.sets, ...incoming.sets.filter((s) => isSet(s) && !setIds.has(s.id))],
    pieces: [
      ...base.pieces,
      ...incoming.pieces.filter((p) => isPiece(p) && !pieceIds.has(p.id)),
    ],
  }
}

/** Guards against a hand-edited file: a piece squatting on a built-in id
 * would be permanently invisible, since lookup checks the catalog first. */
function isPiece(value: unknown): value is FurnitureDefinition {
  const p = value as FurnitureDefinition | null
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.id === 'string' &&
    p.id !== '' &&
    typeof p.name === 'string' &&
    Number.isFinite(p.width) &&
    Number.isFinite(p.depth) &&
    p.width > 0 &&
    p.depth > 0 &&
    p.builtIn !== true &&
    findDefinition(p.id) === undefined
  )
}

function isSet(value: unknown): value is FurnitureSet {
  const s = value as FurnitureSet | null
  return typeof s === 'object' && s !== null && typeof s.id === 'string' && s.id !== ''
}

export function libraryFromProject(project: Project): FurnitureLibrary {
  return {
    version: 1,
    sets: project.furnitureSets ?? [],
    pieces: project.customFurnitureDefs ?? [],
  }
}

/** The project copy of the library, written at save time so the library can
 * be edited without marking the project dirty or pushing a history snapshot. */
export function embedLibrary(project: Project, library: FurnitureLibrary): Project {
  return { ...project, furnitureSets: library.sets, customFurnitureDefs: library.pieces }
}

/** Tolerant by design, and field by field rather than all-or-nothing: a
 * missing key, an unreadable payload or one malformed piece must not cost the
 * user the rest of their library. */
export function parseLibrary(raw: string | null): FurnitureLibrary {
  if (!raw) return EMPTY_LIBRARY
  try {
    const data = JSON.parse(raw) as Partial<FurnitureLibrary> | null
    if (typeof data !== 'object' || data === null) return EMPTY_LIBRARY
    return {
      version: 1,
      sets: Array.isArray(data.sets) ? data.sets.filter(isSet) : [],
      pieces: Array.isArray(data.pieces) ? data.pieces.filter(isPiece) : [],
    }
  } catch {
    return EMPTY_LIBRARY
  }
}

export function serializeLibrary(library: FurnitureLibrary): string {
  return JSON.stringify(library)
}

/** Pieces grouped for display, in set order, with anything whose `setId` is
 * missing or dangling collected under a trailing "Ungrouped" group. */
export interface PieceGroup {
  id: string | null
  name: string
  pieces: FurnitureDefinition[]
}

export const UNGROUPED_NAME = 'Ungrouped'

/** Pieces grouped for the Sets tab, in set order with Ungrouped last.
 *
 * `query` matches a piece's own name, or its set's name - searching for a set
 * shows everything filed in it. With a query, groups left with no pieces are
 * dropped; without one, an empty set still shows so a set the user just
 * created is visible.
 */
export function groupPieces(library: FurnitureLibrary, query = ''): PieceGroup[] {
  const needle = query.trim().toLowerCase()
  const known = new Set(library.sets.map((s) => s.id))
  const matches = (piece: FurnitureDefinition, setName: string) =>
    needle === '' ||
    piece.name.toLowerCase().includes(needle) ||
    setName.toLowerCase().includes(needle)

  const groups: PieceGroup[] = library.sets.map((s) => ({
    id: s.id,
    name: s.name,
    pieces: library.pieces.filter((p) => p.setId === s.id && matches(p, s.name)),
  }))
  const ungrouped = library.pieces.filter(
    (p) => (!p.setId || !known.has(p.setId)) && matches(p, UNGROUPED_NAME),
  )
  if (ungrouped.length > 0) groups.push({ id: null, name: UNGROUPED_NAME, pieces: ungrouped })
  return needle === '' ? groups : groups.filter((g) => g.pieces.length > 0)
}
