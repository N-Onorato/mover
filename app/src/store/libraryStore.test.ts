import { beforeEach, describe, expect, it } from 'vitest'
import { useLibraryStore } from './libraryStore'
import { useUIStore } from './uiStore'
import { EMPTY_LIBRARY, pieceFromInstance } from '../furniture/library'
import type { FurnitureInstance, Project } from '../types/project'

function makeInstance(): FurnitureInstance {
  return {
    id: 'furn-1',
    definitionId: 'sofa-3',
    x: 0,
    y: 0,
    width: 108,
    depth: 40,
    rotation: 0,
    fillColor: '#123456',
    label: 'Sectional',
    locked: false,
    visible: true,
  }
}

beforeEach(() => {
  useLibraryStore.setState({ library: EMPTY_LIBRARY, persistError: false })
  useUIStore.getState().setPendingPlacement(null)
})

describe('useLibraryStore', () => {
  // vitest runs with environment: 'node', so there is no localStorage here.
  // That makes this the same code path as a browser with storage disabled or
  // a full quota: the library must keep working in memory and say so.
  it('mutates in memory and reports the failed write when storage is unavailable', () => {
    const setId = useLibraryStore.getState().createSet('My Apartment')
    expect(useLibraryStore.getState().library.sets).toHaveLength(1)
    expect(useLibraryStore.getState().persistError).toBe(true)

    useLibraryStore.getState().savePiece(pieceFromInstance(makeInstance(), 'Sectional', setId))
    expect(useLibraryStore.getState().library.pieces).toHaveLength(1)
  })

  it('merges a loaded project without duplicating on a second open', () => {
    const project = {
      furnitureSets: [{ id: 'set-1', name: 'Office' }],
      customFurnitureDefs: [pieceFromInstance(makeInstance(), 'Desk', 'set-1', 'piece-1')],
    } as unknown as Project

    useLibraryStore.getState().mergeFromProject(project)
    useLibraryStore.getState().mergeFromProject(project)

    expect(useLibraryStore.getState().library.sets).toHaveLength(1)
    expect(useLibraryStore.getState().library.pieces).toHaveLength(1)
  })

  it('disarms tap-to-place when the armed piece is deleted', () => {
    const setId = useLibraryStore.getState().createSet('Office')
    const piece = pieceFromInstance(makeInstance(), 'Desk', setId)
    useLibraryStore.getState().savePiece(piece)

    useUIStore.getState().setPendingPlacement(piece.id)
    useLibraryStore.getState().deletePiece(piece.id)
    expect(useUIStore.getState().pendingPlacementDefId).toBeNull()
  })

  it('disarms tap-to-place when the armed piece goes with its set', () => {
    const setId = useLibraryStore.getState().createSet('Office')
    const piece = pieceFromInstance(makeInstance(), 'Desk', setId)
    useLibraryStore.getState().savePiece(piece)

    useUIStore.getState().setPendingPlacement(piece.id)
    useLibraryStore.getState().deleteSet(setId)
    expect(useUIStore.getState().pendingPlacementDefId).toBeNull()
  })

  it('leaves an armed built-in catalog item alone when a piece is deleted', () => {
    const setId = useLibraryStore.getState().createSet('Office')
    const piece = pieceFromInstance(makeInstance(), 'Desk', setId)
    useLibraryStore.getState().savePiece(piece)

    useUIStore.getState().setPendingPlacement('sofa-3')
    useLibraryStore.getState().deletePiece(piece.id)
    expect(useUIStore.getState().pendingPlacementDefId).toBe('sofa-3')
  })
})
