import { describe, expect, it } from 'vitest'
import {
  activeFurnitureInstances,
  activeFurnitureLayout,
  createFurnitureLayout,
  duplicateFurnitureLayout,
  layoutFurniture,
  mapActiveLayoutFurniture,
  nextLayoutName,
  uniqueLayoutName,
} from './layouts'
import type { FurnitureInstance, FurnitureLayout, Project } from '../types/project'
import { PROJECT_VERSION } from '../types/project'

function makeFurniture(patch: Partial<FurnitureInstance> = {}): FurnitureInstance {
  return {
    id: 'furn-1',
    definitionId: 'def-1',
    x: 10,
    y: 10,
    width: 6,
    depth: 6,
    rotation: 0,
    fillColor: '#fff',
    label: null,
    locked: false,
    visible: true,
    ...patch,
  }
}

function makeProject(layouts: FurnitureLayout[], activeId = layouts[0]?.id ?? ''): Project {
  return {
    version: PROJECT_VERSION,
    id: 'project-1',
    name: 'Test',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    settings: {
      units: 'imperial',
      gridSize: 12,
      snapToGrid: true,
      snapToWalls: true,
      defaultWallThickness: 4.5,
      backgroundColor: '#f5f5f0',
      rulerMode: 'feet-inches',
      squareCornersToleranceDeg: 5,
    },
    rooms: [],
    interiorWalls: [],
    furnitureLayouts: layouts,
    activeFurnitureLayoutId: activeId,
    customFurnitureDefs: [],
    furnitureSets: [],
    referenceImages: [],
    annotations: [],
  }
}

describe('activeFurnitureLayout', () => {
  it('resolves the layout named by activeFurnitureLayoutId', () => {
    const a = createFurnitureLayout('A')
    const b = createFurnitureLayout('B')
    expect(activeFurnitureLayout(makeProject([a, b], b.id))?.name).toBe('B')
  })

  it('falls back to the first layout when the active id names none', () => {
    const a = createFurnitureLayout('A')
    const b = createFurnitureLayout('B')
    expect(activeFurnitureLayout(makeProject([a, b], 'gone'))?.id).toBe(a.id)
  })

  it('returns undefined, and no furniture, for a project with no layouts', () => {
    const project = makeProject([])
    expect(activeFurnitureLayout(project)).toBeUndefined()
    expect(activeFurnitureInstances(project)).toEqual([])
  })
})

describe('activeFurnitureInstances', () => {
  it('returns only the active layout, not a merge of all of them', () => {
    const a = createFurnitureLayout('A', [makeFurniture({ id: 'a-1' })])
    const b = createFurnitureLayout('B', [makeFurniture({ id: 'b-1' })])
    expect(activeFurnitureInstances(makeProject([a, b], b.id)).map((f) => f.id)).toEqual(['b-1'])
  })

  // zustand selectors compare by identity: a fresh array per call would
  // re-render every furniture consumer on every unrelated store update.
  it('is referentially stable across calls, including the empty case', () => {
    const withFurniture = makeProject([createFurnitureLayout('A', [makeFurniture()])])
    expect(activeFurnitureInstances(withFurniture)).toBe(activeFurnitureInstances(withFurniture))

    const empty = makeProject([])
    expect(activeFurnitureInstances(empty)).toBe(activeFurnitureInstances(empty))
  })
})

describe('layoutFurniture', () => {
  it('reads a named layout regardless of which one is active', () => {
    const a = createFurnitureLayout('A', [makeFurniture({ id: 'a-1' })])
    const b = createFurnitureLayout('B', [makeFurniture({ id: 'b-1' })])
    const project = makeProject([a, b], b.id)
    expect(layoutFurniture(project, a.id).map((f) => f.id)).toEqual(['a-1'])
  })

  it('returns empty for an unknown layout id', () => {
    expect(layoutFurniture(makeProject([createFurnitureLayout('A')]), 'gone')).toEqual([])
  })
})

describe('mapActiveLayoutFurniture', () => {
  it('rewrites only the active layout and preserves the others by identity', () => {
    const a = createFurnitureLayout('A', [makeFurniture({ id: 'a-1' })])
    const b = createFurnitureLayout('B', [makeFurniture({ id: 'b-1' })])
    const project = makeProject([a, b], a.id)

    const layouts = mapActiveLayoutFurniture(project, (fs) => [...fs, makeFurniture({ id: 'a-2' })])

    expect(layouts[0].furnitureInstances.map((f) => f.id)).toEqual(['a-1', 'a-2'])
    expect(layouts[1]).toBe(b)
  })
})

describe('duplicateFurnitureLayout', () => {
  it('gives the copy, and every instance in it, fresh ids', () => {
    const source = createFurnitureLayout('Plan A', [
      makeFurniture({ id: 'furn-1' }),
      makeFurniture({ id: 'furn-2' }),
    ])

    const copy = duplicateFurnitureLayout(source, 'Plan A copy')

    expect(copy.id).not.toBe(source.id)
    expect(copy.name).toBe('Plan A copy')
    const sourceIds = source.furnitureInstances.map((f) => f.id)
    for (const f of copy.furnitureInstances) expect(sourceIds).not.toContain(f.id)
    expect(new Set(copy.furnitureInstances.map((f) => f.id)).size).toBe(2)
  })

  it('copies everything else about each instance', () => {
    const source = createFurnitureLayout('Plan A', [
      makeFurniture({ x: 40, y: 60, rotation: 45, label: 'Sofa' }),
    ])
    expect(duplicateFurnitureLayout(source, 'copy').furnitureInstances[0]).toMatchObject({
      x: 40,
      y: 60,
      rotation: 45,
      label: 'Sofa',
    })
  })

  it('leaves the source layout untouched', () => {
    const source = createFurnitureLayout('Plan A', [makeFurniture({ id: 'furn-1' })])
    duplicateFurnitureLayout(source, 'copy')
    expect(source.furnitureInstances.map((f) => f.id)).toEqual(['furn-1'])
  })
})

describe('layout naming', () => {
  it('leaves an unused name alone', () => {
    expect(uniqueLayoutName([createFurnitureLayout('A')], 'B')).toBe('B')
  })

  it('suffixes a taken name until it is free', () => {
    const layouts = [
      createFurnitureLayout('Plan copy'),
      createFurnitureLayout('Plan copy 2'),
    ]
    expect(uniqueLayoutName(layouts, 'Plan copy')).toBe('Plan copy 3')
  })

  it('names the next layout after the count, avoiding a manual collision', () => {
    expect(nextLayoutName([createFurnitureLayout('Layout 1')])).toBe('Layout 2')
    // The user renamed something to the name the count would have produced:
    // skip to the next free number rather than suffixing.
    const collided = [createFurnitureLayout('Layout 1'), createFurnitureLayout('Layout 3')]
    expect(nextLayoutName(collided)).toBe('Layout 4')
  })
})
