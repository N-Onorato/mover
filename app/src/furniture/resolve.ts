import type { FurnitureDefinition } from '../types/project'
import { findDefinition } from './catalog'
import { useLibraryStore } from '../store/libraryStore'

/** Definition lookup across both sources: the built-in catalog first, then
 * the user's saved pieces (specs/data-model.md). Lives here rather than in
 * catalog.ts so that module stays a pure, store-free data file.
 *
 * This reads the library imperatively. Components that must re-render when
 * the library changes should subscribe with `useLibraryStore` and resolve
 * from the subscribed pieces instead.
 */
export function resolveDefinition(id: string): FurnitureDefinition | undefined {
  return findDefinition(id) ?? findPiece(useLibraryStore.getState().library.pieces, id)
}

export function findPiece(
  pieces: FurnitureDefinition[],
  id: string,
): FurnitureDefinition | undefined {
  return pieces.find((p) => p.id === id)
}
