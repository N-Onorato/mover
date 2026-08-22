import { describe, expect, it } from 'vitest'
import { useProjectStore } from './projectStore'
import { activeFurnitureInstances } from '../project/layouts'
import { findDefinition, resetPatch } from '../furniture/catalog'
import type { FurnitureInstance, InteriorWall, Room } from '../types/project'

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

/** L1 (#28): furniture lives inside a layout now. Tests set both the layouts
 * array and the active id at once, so a fixture stays a single spread. */
const TEST_LAYOUT_ID = 'layout-test'
function furnitureLayoutState(instances: FurnitureInstance[]) {
  return {
    furnitureLayouts: [{ id: TEST_LAYOUT_ID, name: 'Layout 1', furnitureInstances: instances }],
    activeFurnitureLayoutId: TEST_LAYOUT_ID,
  }
}

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

function makeInteriorWall(patch: Partial<InteriorWall> = {}): InteriorWall {
  return {
    id: 'wall-1',
    roomId: 'room-2',
    a: { x: 30, y: 30 },
    b: { x: 40, y: 30 },
    thickness: 4,
    locked: false,
    visible: true,
    ...patch,
  }
}

describe('removeEntities (#27 delete on a mixed multi-selection)', () => {
  it('removes rooms, furniture, and interior walls in one call given a mixed id list', () => {
    const room1 = makeRoom({ id: 'room-1' })
    const room2 = makeRoom({ id: 'room-2' })
    const furniture = makeFurniture({ id: 'furn-1' })
    // Anchored to room-2, which is not itself being removed - only the
    // explicit id in the selection should determine removal here.
    const wall = makeInteriorWall({ id: 'wall-1', roomId: 'room-2' })

    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        rooms: [room1, room2],
        ...furnitureLayoutState([furniture]),
        interiorWalls: [wall],
      },
    }))

    useProjectStore.getState().removeEntities(['room-1', 'furn-1', 'wall-1'])

    const { project } = useProjectStore.getState()
    expect(project.rooms.map((r) => r.id)).toEqual(['room-2'])
    expect(activeFurnitureInstances(project)).toEqual([])
    expect(project.interiorWalls).toEqual([])
  })
})

describe('reset to definition defaults', () => {
  it('leaves position and rotation untouched', () => {
    const instance = makeFurniture({ x: 40, y: 60, rotation: 45, width: 70, label: 'zzz' })
    useProjectStore.setState((state) => ({
      project: { ...state.project, ...furnitureLayoutState([instance]) },
    }))

    const def = findDefinition('sofa-3')!
    useProjectStore.getState().updateFurniture(instance.id, resetPatch(def))

    const updated = activeFurnitureInstances(useProjectStore.getState().project)[0]
    expect(updated).toMatchObject({ x: 40, y: 60, rotation: 45, width: def.width, label: def.name })
  })
})

describe('furniture layouts (L1, #28)', () => {
  function setLayouts(layouts: { id: string; name: string; furnitureInstances: FurnitureInstance[] }[], activeId: string) {
    useProjectStore.setState((s) => ({
      project: { ...s.project, furnitureLayouts: layouts, activeFurnitureLayoutId: activeId },
    }))
  }

  it('places furniture into the active layout only', () => {
    setLayouts(
      [
        { id: 'l1', name: 'A', furnitureInstances: [] },
        { id: 'l2', name: 'B', furnitureInstances: [] },
      ],
      'l2',
    )

    useProjectStore.getState().addFurniture(makeFurniture({ id: 'furn-1' }))

    const { furnitureLayouts } = useProjectStore.getState().project
    expect(furnitureLayouts[0].furnitureInstances).toEqual([])
    expect(furnitureLayouts[1].furnitureInstances.map((f) => f.id)).toEqual(['furn-1'])
  })

  it('updates and removes furniture in the active layout, leaving other layouts alone', () => {
    const shared = makeFurniture({ id: 'furn-1', x: 10 })
    setLayouts(
      [
        { id: 'l1', name: 'A', furnitureInstances: [shared] },
        { id: 'l2', name: 'B', furnitureInstances: [makeFurniture({ id: 'furn-2', x: 10 })] },
      ],
      'l1',
    )

    useProjectStore.getState().updateFurniture('furn-1', { x: 99 })
    expect(activeFurnitureInstances(useProjectStore.getState().project)[0].x).toBe(99)
    expect(useProjectStore.getState().project.furnitureLayouts[1].furnitureInstances[0].x).toBe(10)

    useProjectStore.getState().removeFurniture('furn-1')
    expect(activeFurnitureInstances(useProjectStore.getState().project)).toEqual([])
    expect(useProjectStore.getState().project.furnitureLayouts[1].furnitureInstances).toHaveLength(1)
  })

  it('adds a layout and switches to it', () => {
    setLayouts([{ id: 'l1', name: 'A', furnitureInstances: [] }], 'l1')

    useProjectStore.getState().addFurnitureLayout({ id: 'l2', name: 'B', furnitureInstances: [] })

    const { project } = useProjectStore.getState()
    expect(project.furnitureLayouts.map((l) => l.id)).toEqual(['l1', 'l2'])
    expect(project.activeFurnitureLayoutId).toBe('l2')
  })

  it('refuses to remove the last layout', () => {
    setLayouts([{ id: 'l1', name: 'A', furnitureInstances: [] }], 'l1')

    useProjectStore.getState().removeFurnitureLayout('l1')

    expect(useProjectStore.getState().project.furnitureLayouts.map((l) => l.id)).toEqual(['l1'])
  })

  it('activates a remaining layout when the active one is removed', () => {
    setLayouts(
      [
        { id: 'l1', name: 'A', furnitureInstances: [] },
        { id: 'l2', name: 'B', furnitureInstances: [] },
      ],
      'l2',
    )

    useProjectStore.getState().removeFurnitureLayout('l2')

    const { project } = useProjectStore.getState()
    expect(project.furnitureLayouts.map((l) => l.id)).toEqual(['l1'])
    expect(project.activeFurnitureLayoutId).toBe('l1')
  })

  it('keeps editing the same layout when a different one is removed', () => {
    setLayouts(
      [
        { id: 'l1', name: 'A', furnitureInstances: [] },
        { id: 'l2', name: 'B', furnitureInstances: [] },
      ],
      'l2',
    )

    useProjectStore.getState().removeFurnitureLayout('l1')

    expect(useProjectStore.getState().project.activeFurnitureLayoutId).toBe('l2')
  })

  it('ignores a switch to a layout that does not exist', () => {
    setLayouts([{ id: 'l1', name: 'A', furnitureInstances: [] }], 'l1')

    useProjectStore.getState().setActiveFurnitureLayout('nope')

    expect(useProjectStore.getState().project.activeFurnitureLayoutId).toBe('l1')
  })

  it('renames a layout, ignoring a blank name', () => {
    setLayouts([{ id: 'l1', name: 'A', furnitureInstances: [] }], 'l1')

    useProjectStore.getState().renameFurnitureLayout('l1', '  Kitchen plan  ')
    expect(useProjectStore.getState().project.furnitureLayouts[0].name).toBe('Kitchen plan')

    useProjectStore.getState().renameFurnitureLayout('l1', '   ')
    expect(useProjectStore.getState().project.furnitureLayouts[0].name).toBe('Kitchen plan')
  })

  it('removeEntities sweeps every layout but preserves untouched ones by identity', () => {
    const other = { id: 'l2', name: 'B', furnitureInstances: [makeFurniture({ id: 'furn-2' })] }
    setLayouts([{ id: 'l1', name: 'A', furnitureInstances: [makeFurniture({ id: 'furn-1' })] }, other], 'l1')

    useProjectStore.getState().removeEntities(['furn-1'])

    const { furnitureLayouts } = useProjectStore.getState().project
    expect(furnitureLayouts[0].furnitureInstances).toEqual([])
    expect(furnitureLayouts[1]).toBe(other)
  })
})
