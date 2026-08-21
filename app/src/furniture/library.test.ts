import { describe, expect, it } from 'vitest'
import {
  EMPTY_LIBRARY,
  createSet,
  deletePiece,
  deleteSet,
  embedLibrary,
  groupPieces,
  libraryFromProject,
  mergeLibraries,
  parseLibrary,
  pieceFromInstance,
  renamePiece,
  renameSet,
  savePiece,
  serializeLibrary,
  type FurnitureLibrary,
} from './library'
import { definitionDefaults } from './catalog'
import type { FurnitureDefinition, FurnitureInstance, Project } from '../types/project'

function makePiece(patch: Partial<FurnitureDefinition> = {}): FurnitureDefinition {
  return {
    id: 'piece-1',
    name: 'Sectional',
    category: 'other',
    width: 108,
    depth: 40,
    shape: { type: 'rect' },
    tags: [],
    builtIn: false,
    fillColor: '#123456',
    setId: 'set-1',
    ...patch,
  }
}

function makeInstance(patch: Partial<FurnitureInstance> = {}): FurnitureInstance {
  return {
    id: 'furn-1',
    definitionId: 'sofa-3',
    x: 10,
    y: 20,
    width: 108,
    depth: 40,
    rotation: 90,
    fillColor: '#123456',
    label: 'Sectional',
    locked: false,
    visible: true,
    ...patch,
  }
}

function withPieces(...pieces: FurnitureDefinition[]): FurnitureLibrary {
  return { version: 1, sets: [{ id: 'set-1', name: 'My Apartment' }], pieces }
}

describe('set and piece editing', () => {
  it('creates a set without touching the input library', () => {
    const { library, set } = createSet(EMPTY_LIBRARY, '  My Apartment  ')
    expect(set.name).toBe('My Apartment')
    expect(library.sets).toHaveLength(1)
    expect(EMPTY_LIBRARY.sets).toHaveLength(0)
  })

  it('renames a set and leaves others alone', () => {
    const base = withPieces(makePiece())
    const next = renameSet(base, 'set-1', 'Den')
    expect(next.sets[0].name).toBe('Den')
    expect(base.sets[0].name).toBe('My Apartment')
  })

  it('deletes a set together with its pieces', () => {
    const base = withPieces(makePiece(), makePiece({ id: 'piece-2', setId: undefined }))
    const next = deleteSet(base, 'set-1')
    expect(next.sets).toHaveLength(0)
    expect(next.pieces.map((p) => p.id)).toEqual(['piece-2'])
  })

  it('adds a new piece and replaces an existing one in place', () => {
    const base = withPieces(makePiece({ id: 'a' }), makePiece({ id: 'b' }))
    const added = savePiece(base, makePiece({ id: 'c' }))
    expect(added.pieces.map((p) => p.id)).toEqual(['a', 'b', 'c'])

    const replaced = savePiece(base, makePiece({ id: 'a', width: 200 }))
    expect(replaced.pieces.map((p) => p.id)).toEqual(['a', 'b'])
    expect(replaced.pieces[0].width).toBe(200)
  })

  it('renames and deletes pieces by id', () => {
    const base = withPieces(makePiece())
    expect(renamePiece(base, 'piece-1', ' Couch ').pieces[0].name).toBe('Couch')
    expect(deletePiece(base, 'piece-1').pieces).toHaveLength(0)
    expect(deletePiece(base, 'missing').pieces).toHaveLength(1)
  })
})

describe('pieceFromInstance', () => {
  it('captures the instance size and color', () => {
    const piece = pieceFromInstance(makeInstance(), '  Sectional  ', 'set-1', 'piece-1')
    expect(piece).toMatchObject({
      id: 'piece-1',
      name: 'Sectional',
      width: 108,
      depth: 40,
      fillColor: '#123456',
      setId: 'set-1',
      builtIn: false,
    })
  })

  it('round-trips: placing the saved piece reproduces what was saved', () => {
    const instance = makeInstance()
    const piece = pieceFromInstance(instance, 'Sectional', 'set-1', 'piece-1')
    expect(definitionDefaults(piece)).toEqual({
      width: instance.width,
      depth: instance.depth,
      fillColor: instance.fillColor,
      label: instance.label,
    })
  })
})

describe('mergeLibraries', () => {
  const base = withPieces(makePiece({ width: 108 }))
  const incoming: FurnitureLibrary = {
    version: 1,
    sets: [
      { id: 'set-1', name: 'Stale name' },
      { id: 'set-2', name: 'Office' },
    ],
    pieces: [makePiece({ width: 60 }), makePiece({ id: 'piece-2', setId: 'set-2' })],
  }

  it('keeps the local copy on an id collision', () => {
    const merged = mergeLibraries(base, incoming)
    expect(merged.sets.find((s) => s.id === 'set-1')!.name).toBe('My Apartment')
    expect(merged.pieces.find((p) => p.id === 'piece-1')!.width).toBe(108)
  })

  it('adopts sets and pieces this browser has never seen', () => {
    const merged = mergeLibraries(base, incoming)
    expect(merged.sets.map((s) => s.id)).toEqual(['set-1', 'set-2'])
    expect(merged.pieces.map((p) => p.id)).toEqual(['piece-1', 'piece-2'])
  })

  it('is idempotent, so re-opening a file cannot duplicate a set', () => {
    const once = mergeLibraries(base, incoming)
    expect(mergeLibraries(once, incoming)).toEqual(once)
  })

  it('keeps two sets that share a name', () => {
    const twin = mergeLibraries(base, {
      version: 1,
      sets: [{ id: 'set-9', name: 'My Apartment' }],
      pieces: [],
    })
    expect(twin.sets).toHaveLength(2)
  })

  it('rejects a piece squatting on a built-in catalog id', () => {
    const merged = mergeLibraries(EMPTY_LIBRARY, {
      version: 1,
      sets: [],
      pieces: [makePiece({ id: 'sofa-3' })],
    })
    expect(merged.pieces).toHaveLength(0)
  })

  it('keeps a piece whose set is unknown', () => {
    const merged = mergeLibraries(EMPTY_LIBRARY, {
      version: 1,
      sets: [],
      pieces: [makePiece({ setId: 'gone' })],
    })
    expect(groupPieces(merged)[0]).toMatchObject({ id: null, name: 'Ungrouped' })
  })
})

describe('parseLibrary', () => {
  it('returns an empty library for anything unreadable', () => {
    expect(parseLibrary(null)).toEqual(EMPTY_LIBRARY)
    expect(parseLibrary('not json')).toEqual(EMPTY_LIBRARY)
    expect(parseLibrary('"a string"')).toEqual(EMPTY_LIBRARY)
    expect(parseLibrary('{}')).toEqual(EMPTY_LIBRARY)
    expect(parseLibrary('{"sets":"nope","pieces":"nope"}')).toEqual(EMPTY_LIBRARY)
  })

  it('drops only the malformed pieces, not the whole library', () => {
    const raw = JSON.stringify({
      version: 1,
      sets: [{ id: 'set-1', name: 'My Apartment' }, { name: 'no id' }],
      pieces: [makePiece(), { id: 'bad' }, makePiece({ id: 'piece-3', width: 0 })],
    })
    const library = parseLibrary(raw)
    expect(library.sets.map((s) => s.id)).toEqual(['set-1'])
    expect(library.pieces.map((p) => p.id)).toEqual(['piece-1'])
  })

  it('round-trips a serialized library', () => {
    const library = withPieces(makePiece())
    expect(parseLibrary(serializeLibrary(library))).toEqual(library)
  })
})

describe('project embedding', () => {
  const project = {
    furnitureSets: [],
    customFurnitureDefs: [],
    rooms: [],
    name: 'Test',
  } as unknown as Project

  it('writes the library into the project copy and back out', () => {
    const library = withPieces(makePiece())
    const embedded = embedLibrary(project, library)
    expect(libraryFromProject(embedded)).toEqual(library)
    // The source project is untouched - embedding happens on the way to JSON.
    expect(project.customFurnitureDefs).toHaveLength(0)
  })

  it('tolerates a project saved before sets existed', () => {
    expect(libraryFromProject({} as Project)).toEqual(EMPTY_LIBRARY)
  })
})

describe('groupPieces', () => {
  const library: FurnitureLibrary = {
    version: 1,
    sets: [
      { id: 'set-1', name: 'My Apartment' },
      { id: 'set-2', name: 'Office' },
    ],
    pieces: [
      makePiece({ id: 'a', name: 'Sectional', setId: 'set-1' }),
      makePiece({ id: 'b', name: 'Standing desk', setId: 'set-2' }),
      makePiece({ id: 'c', name: 'Old chair', setId: 'gone' }),
    ],
  }

  it('lists sets in order with Ungrouped last', () => {
    expect(groupPieces(library).map((g) => g.name)).toEqual([
      'My Apartment',
      'Office',
      'Ungrouped',
    ])
  })

  it('shows an empty set only when there is no query', () => {
    const withEmpty = { ...library, sets: [...library.sets, { id: 'set-3', name: 'Garage' }] }
    expect(groupPieces(withEmpty).map((g) => g.name)).toContain('Garage')
    expect(groupPieces(withEmpty, 'desk').map((g) => g.name)).toEqual(['Office'])
  })

  it('matches a piece name or its set name', () => {
    expect(groupPieces(library, 'sectional')[0].pieces.map((p) => p.id)).toEqual(['a'])
    expect(groupPieces(library, 'office')[0].pieces.map((p) => p.id)).toEqual(['b'])
  })
})
