import { describe, expect, it } from 'vitest'
import { LoadError, parseProject } from './load'
import { PROJECT_VERSION } from '../types/project'
import { activeFurnitureInstances } from '../project/layouts'
import { DEFAULT_SETTINGS } from '../store/projectStore'

function baseProject(settingsOverride: Record<string, unknown> = {}) {
  return {
    version: '1.0',
    id: 'abc',
    name: 'Test',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    settings: {
      units: 'imperial',
      gridSize: 12,
      snapToGrid: true,
      snapToWalls: true,
      backgroundColor: '#f5f5f0',
      ...settingsOverride,
    },
    rooms: [],
    furnitureInstances: [],
    customFurnitureDefs: [],
    referenceImages: [],
    annotations: [],
  }
}

describe('parseProject', () => {
  it('throws on invalid JSON', () => {
    expect(() => parseProject('not json')).toThrow(LoadError)
  })

  it('loads fine when an optional array field (e.g. annotations) is missing entirely', () => {
    const raw = baseProject() as Record<string, unknown>
    delete raw.annotations
    delete raw.referenceImages
    const project = parseProject(JSON.stringify(raw))
    expect(project.annotations).toEqual([])
    expect(project.referenceImages).toEqual([])
  })

  it('loads fine when settings is missing entirely, filling in defaults', () => {
    const raw = baseProject() as Record<string, unknown>
    delete raw.settings
    const project = parseProject(JSON.stringify(raw))
    expect(project.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('throws a clear error on a file that is not a Mover project at all', () => {
    expect(() => parseProject(JSON.stringify({ some: 'unrelated', json: 'file' }))).toThrow(
      "This doesn't look like a Mover project file.",
    )
  })

  it('throws on unsupported version', () => {
    expect(() => parseProject(JSON.stringify({ ...baseProject(), version: '0.1' }))).toThrow(
      LoadError,
    )
    expect(() => parseProject(JSON.stringify({ ...baseProject(), version: '2.0' }))).toThrow(
      LoadError,
    )
  })

  it('accepts the current version as well as 1.0', () => {
    const current = parseProject(
      JSON.stringify({ ...baseProject(), version: PROJECT_VERSION, furnitureInstances: undefined }),
    )
    expect(current.version).toBe(PROJECT_VERSION)
  })

  it('backfills rulerMode when missing', () => {
    const project = parseProject(JSON.stringify(baseProject()))
    expect(project.settings.rulerMode).toBe('feet-inches')
  })

  it('backfills defaultWallThickness when missing (pre-E2 saved projects)', () => {
    const project = parseProject(JSON.stringify(baseProject()))
    expect(project.settings.defaultWallThickness).toBe(4.5)
  })

  it('backfills squareCornersToleranceDeg when missing (pre-O3 saved projects)', () => {
    const project = parseProject(JSON.stringify(baseProject()))
    expect(project.settings.squareCornersToleranceDeg).toBe(5)
  })

  it('keeps a saved squareCornersToleranceDeg', () => {
    const project = parseProject(JSON.stringify(baseProject({ squareCornersToleranceDeg: 2.5 })))
    expect(project.settings.squareCornersToleranceDeg).toBe(2.5)
  })

  it('leaves existing settings fields untouched', () => {
    const project = parseProject(
      JSON.stringify(baseProject({ rulerMode: 'simple', defaultWallThickness: 6 })),
    )
    expect(project.settings.rulerMode).toBe('simple')
    expect(project.settings.defaultWallThickness).toBe(6)
  })

  it('backfills interiorWalls when missing (pre-E3 saved projects)', () => {
    const project = parseProject(JSON.stringify(baseProject()))
    expect(project.interiorWalls).toEqual([])
  })

  it('backfills furnitureSets when missing (projects saved before sets existed)', () => {
    const project = parseProject(JSON.stringify(baseProject()))
    expect(project.furnitureSets).toEqual([])
  })

  it('round-trips saved sets and pieces untouched', () => {
    const set = { id: 'set-1', name: 'My Apartment' }
    const piece = {
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
    }
    const project = parseProject(
      JSON.stringify({ ...baseProject(), furnitureSets: [set], customFurnitureDefs: [piece] }),
    )
    expect(project.furnitureSets).toEqual([set])
    expect(project.customFurnitureDefs).toEqual([piece])
  })

  it('round-trips existing interiorWalls untouched', () => {
    const wall = {
      id: 'w1',
      roomId: 'r1',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      thickness: 4.5,
      locked: false,
      visible: true,
    }
    const project = parseProject(
      JSON.stringify({ ...baseProject(), interiorWalls: [wall] }),
    )
    expect(project.interiorWalls).toEqual([wall])
  })
})

describe('parseProject furniture layout migration (L1, #28)', () => {
  const instance = {
    id: 'furn-1',
    definitionId: 'sofa-3',
    x: 10,
    y: 20,
    width: 84,
    depth: 38,
    rotation: 0,
    fillColor: '#abcdef',
    label: 'Sofa',
    locked: false,
    visible: true,
  }

  it('wraps a pre-1.1 flat furnitureInstances array into one default layout', () => {
    const project = parseProject(
      JSON.stringify({ ...baseProject(), furnitureInstances: [instance] }),
    )

    expect(project.furnitureLayouts).toHaveLength(1)
    expect(project.furnitureLayouts[0].name).toBe('Layout 1')
    expect(project.furnitureLayouts[0].furnitureInstances).toEqual([instance])
    expect(project.activeFurnitureLayoutId).toBe(project.furnitureLayouts[0].id)
    expect(activeFurnitureInstances(project)).toEqual([instance])
  })

  it('drops the legacy flat array so nothing can edit it by mistake', () => {
    const project = parseProject(
      JSON.stringify({ ...baseProject(), furnitureInstances: [instance] }),
    )
    expect('furnitureInstances' in project).toBe(false)
  })

  it('re-stamps a migrated 1.0 file as the current version', () => {
    const project = parseProject(JSON.stringify({ ...baseProject(), version: '1.0' }))
    expect(project.version).toBe(PROJECT_VERSION)
  })

  it('gives a project with no furniture at all one empty layout', () => {
    const project = parseProject(JSON.stringify(baseProject()))
    expect(project.furnitureLayouts).toHaveLength(1)
    expect(project.furnitureLayouts[0].furnitureInstances).toEqual([])
  })

  it('round-trips existing layouts and the active id untouched', () => {
    const layouts = [
      { id: 'l1', name: 'With sofa', furnitureInstances: [instance] },
      { id: 'l2', name: 'Without', furnitureInstances: [] },
    ]
    const project = parseProject(
      JSON.stringify({
        ...baseProject(),
        version: PROJECT_VERSION,
        furnitureLayouts: layouts,
        activeFurnitureLayoutId: 'l2',
      }),
    )

    expect(project.furnitureLayouts).toEqual(layouts)
    expect(project.activeFurnitureLayoutId).toBe('l2')
  })

  it('repairs an active id that names no layout', () => {
    const project = parseProject(
      JSON.stringify({
        ...baseProject(),
        version: PROJECT_VERSION,
        furnitureLayouts: [{ id: 'l1', name: 'A', furnitureInstances: [] }],
        activeFurnitureLayoutId: 'gone',
      }),
    )

    expect(project.activeFurnitureLayoutId).toBe('l1')
  })

  it('backfills a layout when furnitureLayouts is present but empty', () => {
    const project = parseProject(
      JSON.stringify({
        ...baseProject(),
        version: PROJECT_VERSION,
        furnitureLayouts: [],
        furnitureInstances: [instance],
      }),
    )

    expect(project.furnitureLayouts).toHaveLength(1)
    expect(project.furnitureLayouts[0].furnitureInstances).toEqual([instance])
  })
})
