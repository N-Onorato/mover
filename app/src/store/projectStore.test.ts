import { describe, expect, it } from 'vitest'
import { useProjectStore } from './projectStore'
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
        furnitureInstances: [furniture],
        interiorWalls: [wall],
      },
    }))

    useProjectStore.getState().removeEntities(['room-1', 'furn-1', 'wall-1'])

    const { project } = useProjectStore.getState()
    expect(project.rooms.map((r) => r.id)).toEqual(['room-2'])
    expect(project.furnitureInstances).toEqual([])
    expect(project.interiorWalls).toEqual([])
  })
})
