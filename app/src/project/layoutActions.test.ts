import { beforeEach, describe, expect, it } from 'vitest'
import {
  activateFurnitureLayout,
  createFurnitureLayoutAndActivate,
  deleteFurnitureLayout,
  duplicateFurnitureLayoutAndActivate,
  renameFurnitureLayout,
} from './layoutActions'
import { activeFurnitureInstances } from './layouts'
import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import type { FurnitureInstance } from '../types/project'

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

function setLayouts(
  layouts: { id: string; name: string; furnitureInstances: FurnitureInstance[] }[],
  activeId: string,
) {
  useProjectStore.setState((s) => ({
    project: { ...s.project, furnitureLayouts: layouts, activeFurnitureLayoutId: activeId },
  }))
}

beforeEach(() => {
  useHistoryStore.getState().clear()
  useUIStore.setState({
    selectedIds: [],
    dragState: null,
    marquee: null,
    interactionMode: 'idle',
    dragAnchorWorld: null,
    compareMode: false,
    comparedLayoutIds: [],
  })
  setLayouts(
    [
      { id: 'l1', name: 'A', furnitureInstances: [makeFurniture({ id: 'furn-1' })] },
      { id: 'l2', name: 'B', furnitureInstances: [] },
    ],
    'l1',
  )
})

describe('activateFurnitureLayout', () => {
  it('switches the layout and drops a selection that belonged to the old one', () => {
    useUIStore.setState({ selectedIds: ['furn-1'] })

    activateFurnitureLayout('l2')

    expect(useProjectStore.getState().project.activeFurnitureLayoutId).toBe('l2')
    expect(useUIStore.getState().selectedIds).toEqual([])
  })

  it('drops an in-flight drag so it cannot commit against the layout left behind', () => {
    useUIStore.setState({
      selectedIds: ['furn-1'],
      dragState: { kind: 'multi', roomIds: [], furnitureIds: ['furn-1'], wallIds: [], imageIds: [], dx: 5, dy: 5 },
      interactionMode: 'multi',
    })

    activateFurnitureLayout('l2')

    expect(useUIStore.getState().dragState).toBeNull()
    expect(useUIStore.getState().interactionMode).toBe('idle')
  })

  // Switching tabs is navigation, not an edit: an undo step here would sit
  // between the user and the edit they actually want to take back.
  it('does not push a history snapshot', () => {
    activateFurnitureLayout('l2')
    expect(useHistoryStore.getState().past).toHaveLength(0)
  })

  it('is a no-op when the layout is already active', () => {
    useUIStore.setState({ selectedIds: ['furn-1'] })
    activateFurnitureLayout('l1')
    expect(useUIStore.getState().selectedIds).toEqual(['furn-1'])
  })
})

describe('createFurnitureLayoutAndActivate', () => {
  it('adds an empty layout, switches to it, and is undoable', () => {
    createFurnitureLayoutAndActivate()

    const { project } = useProjectStore.getState()
    expect(project.furnitureLayouts).toHaveLength(3)
    expect(project.activeFurnitureLayoutId).toBe(project.furnitureLayouts[2].id)
    expect(activeFurnitureInstances(project)).toEqual([])
    expect(useHistoryStore.getState().past).toHaveLength(1)
  })
})

describe('duplicateFurnitureLayoutAndActivate', () => {
  it('copies the source layout, switches to the copy, and re-ids its furniture', () => {
    duplicateFurnitureLayoutAndActivate('l1')

    const { project } = useProjectStore.getState()
    expect(project.furnitureLayouts).toHaveLength(3)
    const copy = project.furnitureLayouts[2]
    expect(project.activeFurnitureLayoutId).toBe(copy.id)
    expect(copy.name).toBe('A copy')
    expect(copy.furnitureInstances).toHaveLength(1)
    expect(copy.furnitureInstances[0].id).not.toBe('furn-1')
    // The source is untouched - that's the whole point of a variant.
    expect(project.furnitureLayouts[0].furnitureInstances[0].id).toBe('furn-1')
  })

  it('ignores an unknown source layout', () => {
    duplicateFurnitureLayoutAndActivate('nope')
    expect(useProjectStore.getState().project.furnitureLayouts).toHaveLength(2)
    expect(useHistoryStore.getState().past).toHaveLength(0)
  })
})

describe('renameFurnitureLayout', () => {
  it('renames and is undoable', () => {
    renameFurnitureLayout('l1', 'Kitchen plan')

    expect(useProjectStore.getState().project.furnitureLayouts[0].name).toBe('Kitchen plan')
    expect(useHistoryStore.getState().past).toHaveLength(1)
  })
})

describe('deleteFurnitureLayout', () => {
  it('removes the layout, is undoable, and clears the selection', () => {
    useUIStore.setState({ selectedIds: ['furn-1'] })

    deleteFurnitureLayout('l1')

    expect(useProjectStore.getState().project.furnitureLayouts.map((l) => l.id)).toEqual(['l2'])
    expect(useUIStore.getState().selectedIds).toEqual([])
    expect(useHistoryStore.getState().past).toHaveLength(1)
  })

  it('drops the deleted layout from the comparison and closes it when nothing is left to compare', () => {
    useUIStore.setState({ compareMode: true, comparedLayoutIds: ['l1', 'l2'] })

    deleteFurnitureLayout('l2')

    expect(useUIStore.getState().comparedLayoutIds).toEqual(['l1'])
    expect(useUIStore.getState().compareMode).toBe(false)
  })

  it('keeps compare mode open while two layouts remain', () => {
    setLayouts(
      [
        { id: 'l1', name: 'A', furnitureInstances: [] },
        { id: 'l2', name: 'B', furnitureInstances: [] },
        { id: 'l3', name: 'C', furnitureInstances: [] },
      ],
      'l1',
    )
    useUIStore.setState({ compareMode: true, comparedLayoutIds: ['l1', 'l2', 'l3'] })

    deleteFurnitureLayout('l3')

    expect(useUIStore.getState().compareMode).toBe(true)
    expect(useUIStore.getState().comparedLayoutIds).toEqual(['l1', 'l2'])
  })

  it('refuses to delete the last layout, without spending a history step', () => {
    setLayouts([{ id: 'l1', name: 'A', furnitureInstances: [] }], 'l1')

    deleteFurnitureLayout('l1')

    expect(useProjectStore.getState().project.furnitureLayouts).toHaveLength(1)
    expect(useHistoryStore.getState().past).toHaveLength(0)
  })
})
