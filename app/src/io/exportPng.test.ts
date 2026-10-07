import { describe, expect, it } from 'vitest'
import {
  MAX_EXPORT_PIXELS,
  MAX_EXPORT_SIDE,
  contentBounds,
  defaultExportName,
  exportMargin,
  fitExportSize,
  padRect,
  pngFilename,
  resolveBackground,
  rotatedRectBounds,
  sanitizeFilename,
  unionRects,
  viewRect,
  type ContentInclude,
} from './exportPng'
import type { FurnitureInstance, Project, ReferenceImage, Room } from '../types/project'
import { PROJECT_VERSION } from '../types/project'

const ALL: ContentInclude = { rooms: true, furniture: true, referenceImages: true, annotations: true }

function room(patch: Partial<Room> = {}): Room {
  return {
    id: 'room-1',
    name: 'Room',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ],
    wallThickness: 10,
    fillColor: '#222',
    wallColor: '#888',
    locked: false,
    visible: true,
    ...patch,
  }
}

function furniture(patch: Partial<FurnitureInstance> = {}): FurnitureInstance {
  return {
    id: 'f-1',
    definitionId: 'd',
    x: 10,
    y: 10,
    width: 20,
    depth: 10,
    rotation: 0,
    fillColor: '#fff',
    label: null,
    locked: false,
    visible: true,
    ...patch,
  }
}

function image(patch: Partial<ReferenceImage> = {}): ReferenceImage {
  return {
    id: 'img-1',
    name: 'img',
    src: 'data:',
    x: -40,
    y: -30,
    width: 20,
    height: 10,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    calibration: null,
    ...patch,
  }
}

function project(patch: Partial<Project> = {}): Project {
  return {
    version: PROJECT_VERSION,
    id: 'p',
    name: 'Test',
    created: '',
    modified: '',
    settings: {
      units: 'imperial',
      gridSize: 12,
      snapToGrid: true,
      snapToWalls: true,
      defaultWallThickness: 4.5,
      backgroundColor: '#f5f5f0',
      rulerMode: 'feet-inches',
    },
    rooms: [],
    interiorWalls: [],
    furnitureLayouts: [
      { id: 'a', name: 'A', furnitureInstances: [furniture({ id: 'fa' })] },
      { id: 'b', name: 'B', furnitureInstances: [furniture({ id: 'fb', x: 200, y: 200 })] },
    ],
    activeFurnitureLayoutId: 'a',
    customFurnitureDefs: [],
    furnitureSets: [],
    referenceImages: [],
    annotations: [],
    ...patch,
  }
}

describe('rect helpers', () => {
  it('unions rects and returns null for none', () => {
    expect(unionRects([])).toBeNull()
    expect(
      unionRects([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: -5, width: 5, height: 5 },
      ]),
    ).toEqual({ x: 0, y: -5, width: 25, height: 15 })
  })

  it('pads a rect on every side', () => {
    expect(padRect({ x: 10, y: 10, width: 20, height: 5 }, 3)).toEqual({
      x: 7,
      y: 7,
      width: 26,
      height: 11,
    })
  })

  it('bounds a rect rotated about its center', () => {
    const b = rotatedRectBounds(0, 0, 20, 10, 90)
    expect(b.x).toBeCloseTo(5)
    expect(b.y).toBeCloseTo(-5)
    expect(b.width).toBeCloseTo(10)
    expect(b.height).toBeCloseTo(20)
    expect(rotatedRectBounds(0, 0, 20, 10, 0)).toEqual({ x: 0, y: 0, width: 20, height: 10 })
  })

  it('converts a panned viewport to a world rect', () => {
    expect(viewRect({ x: 30, y: 60 }, 800, 600, 10)).toEqual({ x: -3, y: -6, width: 80, height: 60 })
  })

  it('uses a bigger margin in metric than imperial world units', () => {
    expect(exportMargin('imperial')).toBe(24)
    expect(exportMargin('metric')).toBe(50)
  })
})

describe('contentBounds', () => {
  it('is null for an empty plan', () => {
    expect(contentBounds(project({ furnitureLayouts: [] }), 'a', ALL)).toBeNull()
  })

  it('includes wall stroke, furniture and reference images', () => {
    const p = project({ rooms: [room()], referenceImages: [image()] })
    // room: x -5..105, y -5..55; image: x -40..-20, y -30..-20; furniture inside the room
    expect(contentBounds(p, 'a', ALL)).toEqual({ x: -40, y: -30, width: 145, height: 85 })
  })

  it('draws only the requested layout furniture', () => {
    const p = project({ rooms: [room()] })
    expect(contentBounds(p, 'a', ALL)).toEqual({ x: -5, y: -5, width: 110, height: 60 })
    expect(contentBounds(p, 'b', ALL)).toEqual({ x: -5, y: -5, width: 225, height: 215 })
  })

  it('respects the include flags', () => {
    const p = project({ rooms: [room()], referenceImages: [image()] })
    expect(contentBounds(p, 'a', { ...ALL, referenceImages: false })).toEqual({
      x: -5,
      y: -5,
      width: 110,
      height: 60,
    })
    expect(contentBounds(p, 'a', { ...ALL, rooms: false, referenceImages: false })).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 10,
    })
  })

  it('skips entities flagged invisible', () => {
    const p = project({ rooms: [room({ visible: false })] })
    expect(contentBounds(p, 'a', ALL)).toEqual({ x: 10, y: 10, width: 20, height: 10 })
  })

  it('includes interior walls of visible rooms only', () => {
    const wall = { id: 'w', roomId: 'room-1', a: { x: 50, y: 0 }, b: { x: 50, y: 200 }, thickness: 4, locked: false, visible: true }
    const shown = project({ rooms: [room()], interiorWalls: [wall] })
    expect(contentBounds(shown, 'a', ALL)?.height).toBe(207)
    const hidden = project({ rooms: [room({ visible: false })], interiorWalls: [wall] })
    expect(contentBounds(hidden, 'a', ALL)).toEqual({ x: 10, y: 10, width: 20, height: 10 })
  })

  it('restricts to selected ids', () => {
    const p = project({ rooms: [room()], referenceImages: [image()] })
    expect(contentBounds(p, 'a', ALL, new Set(['fa']))).toEqual({ x: 10, y: 10, width: 20, height: 10 })
    expect(contentBounds(p, 'a', ALL, new Set(['img-1']))).toEqual({ x: -40, y: -30, width: 20, height: 10 })
    expect(contentBounds(p, 'a', ALL, new Set(['nothing']))).toBeNull()
  })
})

describe('fitExportSize', () => {
  it('multiplies by the requested scale when under the caps', () => {
    expect(fitExportSize(1000, 500, 2)).toEqual({ scale: 2, width: 2000, height: 1000, capped: false })
    expect(fitExportSize(1000, 500, 1)).toEqual({ scale: 1, width: 1000, height: 500, capped: false })
  })

  it('caps the longest side', () => {
    const size = fitExportSize(8000, 100, 4)
    expect(size.capped).toBe(true)
    expect(size.width).toBeLessThanOrEqual(MAX_EXPORT_SIDE)
    expect(size.width).toBe(MAX_EXPORT_SIDE)
    expect(size.height).toBe(Math.floor(100 * size.scale))
  })

  it('caps the total pixel area', () => {
    const size = fitExportSize(6000, 6000, 2)
    expect(size.capped).toBe(true)
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_EXPORT_PIXELS)
    // Aspect ratio is preserved.
    expect(size.width).toBe(size.height)
  })

  it('reduces below 1x when even 1x would exceed the caps', () => {
    const size = fitExportSize(40000, 10, 1)
    expect(size.capped).toBe(true)
    expect(size.scale).toBeLessThan(1)
    expect(size.width).toBe(MAX_EXPORT_SIDE)
  })

  it('never returns an empty bitmap', () => {
    const size = fitExportSize(0, 0, 1)
    expect(size.width).toBeGreaterThanOrEqual(1)
    expect(size.height).toBeGreaterThanOrEqual(1)
  })
})

describe('resolveBackground', () => {
  it('maps each mode to a color, and transparent to null', () => {
    expect(resolveBackground('project', '#f5f5f0', '#123456')).toBe('#f5f5f0')
    expect(resolveBackground('white', '#f5f5f0', '#123456')).toBe('#ffffff')
    expect(resolveBackground('custom', '#f5f5f0', '#123456')).toBe('#123456')
    expect(resolveBackground('transparent', '#f5f5f0', '#123456')).toBeNull()
  })
})

describe('filenames', () => {
  it('strips characters that are invalid on common filesystems', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
    expect(sanitizeFilename('tab\there\u0000')).toBe('tab here')
  })

  it('trims trailing dots and spaces and leading dots', () => {
    expect(sanitizeFilename('  My plan. . ')).toBe('My plan')
    expect(sanitizeFilename('.hidden')).toBe('hidden')
  })

  it('avoids Windows device names', () => {
    expect(sanitizeFilename('CON')).toBe('CON_')
    expect(sanitizeFilename('lpt1')).toBe('lpt1_')
    expect(sanitizeFilename('console')).toBe('console')
  })

  it('falls back when nothing usable is left and bounds the length', () => {
    expect(sanitizeFilename('???')).toBe('layout')
    expect(sanitizeFilename('', 'x')).toBe('x')
    expect(sanitizeFilename('a'.repeat(500)).length).toBeLessThanOrEqual(100)
  })

  it('builds <project>-<layout> and one .png extension', () => {
    expect(defaultExportName('My House', 'Layout 1')).toBe('My House-Layout 1')
    expect(defaultExportName('a/b', '')).toBe('a b-layout')
    expect(pngFilename('plan')).toBe('plan.png')
    expect(pngFilename('plan.PNG')).toBe('plan.png')
    expect(pngFilename('  ')).toBe('layout.png')
  })
})
