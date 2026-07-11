import { describe, expect, it } from 'vitest'
import { LoadError, parseProject } from './load'

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

  it('throws on unsupported version', () => {
    expect(() => parseProject(JSON.stringify({ ...baseProject(), version: '0.1' }))).toThrow(
      LoadError,
    )
  })

  it('backfills rulerMode when missing', () => {
    const project = parseProject(JSON.stringify(baseProject()))
    expect(project.settings.rulerMode).toBe('feet-inches')
  })

  it('backfills defaultWallThickness when missing (pre-E2 saved projects)', () => {
    const project = parseProject(JSON.stringify(baseProject()))
    expect(project.settings.defaultWallThickness).toBe(4.5)
  })

  it('leaves existing settings fields untouched', () => {
    const project = parseProject(
      JSON.stringify(baseProject({ rulerMode: 'simple', defaultWallThickness: 6 })),
    )
    expect(project.settings.rulerMode).toBe('simple')
    expect(project.settings.defaultWallThickness).toBe(6)
  })
})
