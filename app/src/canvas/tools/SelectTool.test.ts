import { describe, expect, it, beforeEach } from 'vitest'
import { SelectTool } from './SelectTool'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import type { FurnitureInstance, InteriorWall, Room } from '../../types/project'

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

function makeRoom(patch: Partial<Room> = {}): Room {
  return {
    id: 'room-1',
    name: 'Room',
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ],
    wallThickness: 4,
    fillColor: '#eee',
    wallColor: '#333',
    locked: false,
    visible: true,
    ...patch,
  }
}

function makeInteriorWall(patch: Partial<InteriorWall> = {}): InteriorWall {
  return {
    id: 'wall-1',
    roomId: 'room-1',
    a: { x: 30, y: 30 },
    b: { x: 40, y: 30 },
    thickness: 4,
    locked: false,
    visible: true,
    ...patch,
  }
}

describe('SelectTool.onPointerDown furniture hit-testing', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedIds: [],
      dragState: null,
      interactionMode: 'idle',
      dragAnchorWorld: null,
      marquee: null,
      lockedLayers: {
        referenceImages: true,
        rooms: false,
        furniture: false,
        annotations: false,
      },
    })
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        rooms: [],
        interiorWalls: [],
        furnitureInstances: [],
        referenceImages: [],
        settings: { ...s.project.settings, snapToGrid: true, gridSize: 12 },
      },
    }))
  })

  it('selects furniture smaller than one grid cell, placed off-grid, on the first click with nothing pre-selected', () => {
    // 6x6 furniture straddling grid intersections at x=12/y=12: no grid point
    // falls inside its bounds, so a snapped pointer-down would always miss it.
    const furniture = makeFurniture({ x: 13, y: 13, width: 6, depth: 6 })
    useProjectStore.setState((s) => ({
      project: { ...s.project, furnitureInstances: [furniture] },
    }))

    const clickWorld = { x: 16, y: 16 } // inside the furniture, off-grid
    const snappedWorld = { x: 12, y: 12 } // what getWorldPoint would've produced pre-fix

    SelectTool.onPointerDown(snappedWorld, clickWorld, 10, { shift: false, ctrl: false })

    expect(useUIStore.getState().selectedIds).toEqual([furniture.id])
    expect(useUIStore.getState().interactionMode).toBe('furnitureMove')
  })

  it('still starts a marquee drag when the raw click misses every furniture instance', () => {
    const furniture = makeFurniture({ x: 100, y: 100, width: 6, depth: 6 })
    useProjectStore.setState((s) => ({
      project: { ...s.project, furnitureInstances: [furniture] },
    }))

    const clickWorld = { x: 0, y: 0 }
    SelectTool.onPointerDown(clickWorld, clickWorld, 10, { shift: false, ctrl: false })

    expect(useUIStore.getState().interactionMode).toBe('marquee')
    expect(useUIStore.getState().selectedIds).toEqual([])
  })
})

describe('SelectTool marquee selection', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedIds: [],
      dragState: null,
      interactionMode: 'idle',
      dragAnchorWorld: null,
      marquee: null,
      lockedLayers: {
        referenceImages: false,
        rooms: false,
        furniture: false,
        annotations: false,
      },
    })
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        rooms: [],
        interiorWalls: [],
        furnitureInstances: [],
        referenceImages: [],
        settings: { ...s.project.settings, snapToGrid: false },
      },
    }))
  })

  function dragMarquee(from: { x: number; y: number }, to: { x: number; y: number }) {
    SelectTool.onPointerDown(from, from, 10, { shift: false, ctrl: false })
    SelectTool.onPointerMove(to, 10, { shift: false, ctrl: false })
    SelectTool.onPointerUp(to, 10, { shift: false, ctrl: false })
  }

  it('still begins a marquee drag when the rooms layer is locked, instead of clearing selection outright', () => {
    useProjectStore.setState((s) => ({
      project: { ...s.project, rooms: [makeRoom()] },
    }))
    useUIStore.setState((s) => ({ lockedLayers: { ...s.lockedLayers, rooms: true } }))

    const empty = { x: -10, y: -10 }
    SelectTool.onPointerDown(empty, empty, 10, { shift: false, ctrl: false })

    expect(useUIStore.getState().interactionMode).toBe('marquee')
  })

  it('selects rooms, furniture, and interior walls fully inside the drag box together', () => {
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        rooms: [makeRoom()],
        furnitureInstances: [makeFurniture()],
        interiorWalls: [makeInteriorWall()],
      },
    }))

    dragMarquee({ x: -10, y: -10 }, { x: 60, y: 60 })

    expect(useUIStore.getState().selectedIds).toEqual(['room-1', 'furn-1', 'wall-1'])
    expect(useUIStore.getState().interactionMode).toBe('idle')
    expect(useUIStore.getState().marquee).toBeNull()
  })

  it('excludes furniture from the marquee when the furniture layer is locked, but still selects rooms', () => {
    useProjectStore.setState((s) => ({
      project: { ...s.project, rooms: [makeRoom()], furnitureInstances: [makeFurniture()] },
    }))
    useUIStore.setState((s) => ({ lockedLayers: { ...s.lockedLayers, furniture: true } }))

    dragMarquee({ x: -10, y: -10 }, { x: 60, y: 60 })

    expect(useUIStore.getState().selectedIds).toEqual(['room-1'])
  })

  it('excludes interior walls from the marquee when their parent room is locked', () => {
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        rooms: [makeRoom({ locked: true })],
        interiorWalls: [makeInteriorWall()],
      },
    }))

    dragMarquee({ x: -10, y: -10 }, { x: 60, y: 60 })

    expect(useUIStore.getState().selectedIds).toEqual([])
  })
})
