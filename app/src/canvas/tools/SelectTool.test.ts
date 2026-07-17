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
    expect(useUIStore.getState().interactionMode).toBe('multi')
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

describe('SelectTool multi-item drag (#27)', () => {
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
        settings: { ...s.project.settings, snapToGrid: false },
      },
    }))
  })

  it('drags a room, furniture, and an unrelated selected interior wall together when clicking the room', () => {
    const room = makeRoom()
    const furniture = makeFurniture({ id: 'furn-1', x: 100, y: 100 })
    // Wall belongs to a different, unselected room - only dragged because
    // it's explicitly part of the multi-selection.
    const otherRoom = makeRoom({ id: 'room-2', points: room.points.map((p) => ({ x: p.x + 200, y: p.y + 200 })) })
    const wall = makeInteriorWall({ id: 'wall-1', roomId: 'room-2', a: { x: 205, y: 205 }, b: { x: 215, y: 205 } })

    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        rooms: [room, otherRoom],
        furnitureInstances: [furniture],
        interiorWalls: [wall],
      },
    }))
    useUIStore.setState({ selectedIds: ['room-1', 'furn-1', 'wall-1'] })

    const clickInsideRoom = { x: 10, y: 10 }
    SelectTool.onPointerDown(clickInsideRoom, clickInsideRoom, 10, { shift: false, ctrl: false })
    expect(useUIStore.getState().interactionMode).toBe('multi')

    SelectTool.onPointerMove({ x: 15, y: 20 }, 10, { shift: false, ctrl: false })
    SelectTool.onPointerUp({ x: 15, y: 20 }, 10, { shift: false, ctrl: false })

    const { project } = useProjectStore.getState()
    expect(project.rooms.find((r) => r.id === 'room-1')!.points[0]).toEqual({ x: 5, y: 10 })
    expect(project.furnitureInstances.find((f) => f.id === 'furn-1')).toMatchObject({ x: 105, y: 110 })
    expect(project.interiorWalls.find((w) => w.id === 'wall-1')).toMatchObject({
      a: { x: 210, y: 215 },
      b: { x: 220, y: 215 },
    })
  })

  it('drags an interior wall belonging to a selected room along with the room, even when the wall is not itself selected', () => {
    const room = makeRoom()
    const wall = makeInteriorWall({ roomId: 'room-1', a: { x: 5, y: 5 }, b: { x: 15, y: 5 } })

    useProjectStore.setState((s) => ({
      project: { ...s.project, rooms: [room], interiorWalls: [wall] },
    }))
    useUIStore.setState({ selectedIds: ['room-1', 'furn-does-not-exist'] })

    const clickInsideRoom = { x: 10, y: 10 }
    SelectTool.onPointerDown(clickInsideRoom, clickInsideRoom, 10, { shift: false, ctrl: false })
    SelectTool.onPointerMove({ x: 20, y: 10 }, 10, { shift: false, ctrl: false })
    SelectTool.onPointerUp({ x: 20, y: 10 }, 10, { shift: false, ctrl: false })

    const { project } = useProjectStore.getState()
    expect(project.interiorWalls[0]).toMatchObject({ a: { x: 15, y: 5 }, b: { x: 25, y: 5 } })
  })

  it('routes single-item drags through the same shared multi drag path when nothing else is selected', () => {
    const furniture = makeFurniture({ id: 'furn-1' })
    useProjectStore.setState((s) => ({ project: { ...s.project, furnitureInstances: [furniture] } }))
    useUIStore.setState({ selectedIds: ['furn-1'] })

    const click = { x: 13, y: 13 }
    SelectTool.onPointerDown(click, click, 10, { shift: false, ctrl: false })

    expect(useUIStore.getState().interactionMode).toBe('multi')
    expect(useUIStore.getState().dragState?.kind).toBe('multi')
  })

  it('wants raw (unsnapped) pointer coordinates for a multi-selection that includes furniture, so the drag tracks the cursor instead of jumping in grid steps', () => {
    const furniture = makeFurniture({ id: 'furn-1' })
    useProjectStore.setState((s) => ({ project: { ...s.project, furnitureInstances: [furniture] } }))
    useUIStore.setState({ selectedIds: ['room-1', 'furn-1'] })

    expect(SelectTool.wantsRawPointer?.()).toBe(true)
  })

  it('leaves selectedIds intact after a multi-drag completes, so a follow-up delete still sees every item', () => {
    const room = makeRoom()
    const furniture = makeFurniture({ id: 'furn-1', x: 100, y: 100 })

    useProjectStore.setState((s) => ({
      project: { ...s.project, rooms: [room], furnitureInstances: [furniture] },
    }))
    useUIStore.setState({ selectedIds: ['room-1', 'furn-1'] })

    const clickInsideRoom = { x: 10, y: 10 }
    SelectTool.onPointerDown(clickInsideRoom, clickInsideRoom, 10, { shift: false, ctrl: false })
    SelectTool.onPointerMove({ x: 15, y: 20 }, 10, { shift: false, ctrl: false })
    SelectTool.onPointerUp({ x: 15, y: 20 }, 10, { shift: false, ctrl: false })

    expect(useUIStore.getState().selectedIds).toEqual(['room-1', 'furn-1'])
    expect(useUIStore.getState().interactionMode).toBe('idle')
    expect(useUIStore.getState().dragState).toBeNull()

    // Mirrors MenuBar's handleDeleteSelected.
    useProjectStore.getState().removeEntities(useUIStore.getState().selectedIds)
    useUIStore.getState().clearSelection()

    const { project } = useProjectStore.getState()
    expect(project.rooms).toEqual([])
    expect(project.furnitureInstances).toEqual([])
    expect(useUIStore.getState().selectedIds).toEqual([])
  })
})
