import { describe, expect, it } from 'vitest'
import {
  CATEGORY_COLORS,
  createFurnitureInstance,
  definitionDefaults,
  findDefinition,
  matchesDefault,
  resetPatch,
} from './catalog'
import type { FurnitureDefinition, FurnitureInstance } from '../types/project'

const sofa = findDefinition('sofa-3')!

function makePiece(patch: Partial<FurnitureDefinition> = {}): FurnitureDefinition {
  return {
    id: 'piece-1',
    name: "Mom's couch",
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
    definitionId: sofa.id,
    x: 10,
    y: 20,
    width: sofa.width,
    depth: sofa.depth,
    rotation: 45,
    fillColor: CATEGORY_COLORS[sofa.category],
    label: sofa.name,
    locked: false,
    visible: true,
    ...patch,
  }
}

describe('definitionDefaults', () => {
  it('falls back to the category color for a built-in', () => {
    expect(definitionDefaults(sofa)).toEqual({
      width: 84,
      depth: 32,
      fillColor: CATEGORY_COLORS.seating,
      label: 'Sofa (3-seat)',
    })
  })

  it('uses a saved piece own color', () => {
    expect(definitionDefaults(makePiece()).fillColor).toBe('#123456')
  })
})

describe('resetPatch', () => {
  it('restores size, color and label only', () => {
    expect(Object.keys(resetPatch(sofa)).sort()).toEqual(['depth', 'fillColor', 'label', 'width'])
  })

  it('carries the definition values', () => {
    expect(resetPatch(makePiece())).toEqual({
      width: 108,
      depth: 40,
      fillColor: '#123456',
      label: "Mom's couch",
    })
  })
})

describe('matchesDefault', () => {
  it('is true for a freshly placed instance', () => {
    const instance = createFurnitureInstance(sofa, { x: 0, y: 0 })
    expect(matchesDefault(instance, sofa)).toBe(true)
  })

  it('is false once a field is customized', () => {
    expect(matchesDefault(makeInstance({ width: 70 }), sofa)).toBe(false)
    expect(matchesDefault(makeInstance({ label: 'zzz' }), sofa)).toBe(false)
    expect(matchesDefault(makeInstance({ fillColor: '#000000' }), sofa)).toBe(false)
  })

  it('ignores float noise from parsed lengths', () => {
    expect(matchesDefault(makeInstance({ width: sofa.width + 1e-9 }), sofa)).toBe(true)
    expect(matchesDefault(makeInstance({ width: sofa.width + 0.01 }), sofa)).toBe(false)
  })

  it('compares colors case-insensitively', () => {
    const piece = makePiece({ fillColor: '#ABCDEF' })
    const instance = makeInstance({ definitionId: piece.id, fillColor: '#abcdef' })
    expect(matchesDefault({ ...instance, width: 108, depth: 40, label: piece.name }, piece)).toBe(
      true,
    )
  })

  it('is unaffected by position and rotation', () => {
    expect(matchesDefault(makeInstance({ x: 999, y: -3, rotation: 275 }), sofa)).toBe(true)
  })
})

describe('createFurnitureInstance', () => {
  it('centers the definition on the point', () => {
    const instance = createFurnitureInstance(sofa, { x: 100, y: 100 })
    expect(instance.x).toBe(100 - 84 / 2)
    expect(instance.y).toBe(100 - 32 / 2)
  })

  it('keeps a saved piece color and name', () => {
    const instance = createFurnitureInstance(makePiece(), { x: 0, y: 0 })
    expect(instance.fillColor).toBe('#123456')
    expect(instance.label).toBe("Mom's couch")
    expect(instance.definitionId).toBe('piece-1')
  })
})
