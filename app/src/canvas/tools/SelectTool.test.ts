import { describe, expect, it, beforeEach } from 'vitest'
import { SelectTool } from './SelectTool'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { activeFurnitureInstances } from '../../project/layouts'
import { useHistoryStore } from '../../store/historyStore'
import type { FurnitureInstance, InteriorWall, ReferenceImage, Room } from '../../types/project'

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

/** Deliberately shares makeRoom's 0,0-20,20 footprint: "image under a room"
 * is the normal case (#33) and needs no extra setup. */
function makeReferenceImage(patch: Partial<ReferenceImage> = {}): ReferenceImage {
  return {
    id: 'img-1',
    name: 'Reference Image',
    src: '',
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    rotation: 0,
    opacity: 0.6,
    locked: false,
    visible: true,
    calibration: null,
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
        ...furnitureLayoutState([]),
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
      project: { ...s.project, ...furnitureLayoutState([furniture]) },
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
      project: { ...s.project, ...furnitureLayoutState([furniture]) },
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
        ...furnitureLayoutState([]),
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
        ...furnitureLayoutState([makeFurniture()]),
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
      project: { ...s.project, rooms: [makeRoom()], ...furnitureLayoutState([makeFurniture()]) },
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
        ...furnitureLayoutState([]),
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
        ...furnitureLayoutState([furniture]),
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
    expect(activeFurnitureInstances(project).find((f) => f.id === 'furn-1')).toMatchObject({ x: 105, y: 110 })
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
    useProjectStore.setState((s) => ({ project: { ...s.project, ...furnitureLayoutState([furniture]) } }))
    useUIStore.setState({ selectedIds: ['furn-1'] })

    const click = { x: 13, y: 13 }
    SelectTool.onPointerDown(click, click, 10, { shift: false, ctrl: false })

    expect(useUIStore.getState().interactionMode).toBe('multi')
    expect(useUIStore.getState().dragState?.kind).toBe('multi')
  })

  it('wants raw (unsnapped) pointer coordinates for a multi-selection that includes furniture, so the drag tracks the cursor instead of jumping in grid steps', () => {
    const furniture = makeFurniture({ id: 'furn-1' })
    useProjectStore.setState((s) => ({ project: { ...s.project, ...furnitureLayoutState([furniture]) } }))
    useUIStore.setState({ selectedIds: ['room-1', 'furn-1'] })

    expect(SelectTool.wantsRawPointer?.()).toBe(true)
  })

  it('leaves selectedIds intact after a multi-drag completes, so a follow-up delete still sees every item', () => {
    const room = makeRoom()
    const furniture = makeFurniture({ id: 'furn-1', x: 100, y: 100 })

    useProjectStore.setState((s) => ({
      project: { ...s.project, rooms: [room], ...furnitureLayoutState([furniture]) },
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
    expect(activeFurnitureInstances(project)).toEqual([])
    expect(useUIStore.getState().selectedIds).toEqual([])
  })
})

/** M2 (#33): the click-priority rule is "topmost unlocked, visible layer under
 * the cursor wins". These lock that ordering so it can't silently regress back
 * into geometry-dependent behavior. */
describe('SelectTool reference-image click priority (#33)', () => {
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
        ...furnitureLayoutState([]),
        referenceImages: [],
        settings: { ...s.project.settings, snapToGrid: false },
      },
    }))
  })

  function clickAt(pt: { x: number; y: number }) {
    SelectTool.onPointerDown(pt, pt, 10, { shift: false, ctrl: false })
  }

  it('selects the room, not the reference image beneath it, when both layers are unlocked', () => {
    useProjectStore.setState((s) => ({
      project: { ...s.project, rooms: [makeRoom()], referenceImages: [makeReferenceImage()] },
    }))

    clickAt({ x: 10, y: 10 })

    expect(useUIStore.getState().selectedIds).toEqual(['room-1'])
  })

  it('selects the reference image beneath the room once the rooms layer is locked', () => {
    useProjectStore.setState((s) => ({
      project: { ...s.project, rooms: [makeRoom()], referenceImages: [makeReferenceImage()] },
    }))
    useUIStore.setState((s) => ({ lockedLayers: { ...s.lockedLayers, rooms: true } }))

    clickAt({ x: 10, y: 10 })

    expect(useUIStore.getState().selectedIds).toEqual(['img-1'])
  })

  it('selects a reference image that no room covers', () => {
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        rooms: [makeRoom({ points: [
          { x: 100, y: 100 },
          { x: 120, y: 100 },
          { x: 120, y: 120 },
          { x: 100, y: 120 },
        ] })],
        referenceImages: [makeReferenceImage()],
      },
    }))

    clickAt({ x: 10, y: 10 })

    expect(useUIStore.getState().selectedIds).toEqual(['img-1'])
  })

  it('selects furniture drawn over a reference image, not the image', () => {
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        ...furnitureLayoutState([makeFurniture({ x: 8, y: 8, width: 6, depth: 6 })]),
        referenceImages: [makeReferenceImage()],
      },
    }))

    clickAt({ x: 10, y: 10 })

    expect(useUIStore.getState().selectedIds).toEqual(['furn-1'])
  })

  it('never click-selects an image while the reference-images layer is locked (the default)', () => {
    useProjectStore.setState((s) => ({
      project: { ...s.project, referenceImages: [makeReferenceImage()] },
    }))
    useUIStore.setState((s) => ({ lockedLayers: { ...s.lockedLayers, referenceImages: true } }))

    clickAt({ x: 10, y: 10 })

    expect(useUIStore.getState().selectedIds).toEqual([])
    expect(useUIStore.getState().interactionMode).toBe('marquee')
  })

  it('ignores an item-locked or hidden image and falls through to a marquee', () => {
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        referenceImages: [
          makeReferenceImage({ id: 'img-locked', locked: true }),
          makeReferenceImage({ id: 'img-hidden', visible: false }),
        ],
      },
    }))

    clickAt({ x: 10, y: 10 })

    expect(useUIStore.getState().selectedIds).toEqual([])
    expect(useUIStore.getState().interactionMode).toBe('marquee')
  })

  it('marquee-selects a covered image together with the room on top of it', () => {
    // The documented escape hatch: marquee unions across entity types instead
    // of taking the first hit, so z-order doesn't apply.
    useProjectStore.setState((s) => ({
      project: { ...s.project, rooms: [makeRoom()], referenceImages: [makeReferenceImage()] },
    }))

    const from = { x: -5, y: -5 }
    const to = { x: 30, y: 30 }
    SelectTool.onPointerDown(from, from, 10, { shift: false, ctrl: false })
    SelectTool.onPointerMove(to, 10, { shift: false, ctrl: false })
    SelectTool.onPointerUp(to, 10, { shift: false, ctrl: false })

    expect(useUIStore.getState().selectedIds).toContain('img-1')
    expect(useUIStore.getState().selectedIds).toContain('room-1')
  })
})

/** L3 (#30): images join the rigid-translation drag path. */
describe('SelectTool reference-image drag (#30)', () => {
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
        ...furnitureLayoutState([]),
        referenceImages: [],
        settings: { ...s.project.settings, snapToGrid: false },
      },
    }))
    useHistoryStore.setState({ past: [], future: [] })
  })

  function dragImage(from: { x: number; y: number }, to: { x: number; y: number }) {
    SelectTool.onPointerDown(from, from, 10, { shift: false, ctrl: false })
    SelectTool.onPointerMove(to, 10, { shift: false, ctrl: false })
    SelectTool.onPointerUp(to, 10, { shift: false, ctrl: false })
  }

  it('starts a multi drag on an image body instead of only selecting it', () => {
    useProjectStore.setState((s) => ({
      project: { ...s.project, referenceImages: [makeReferenceImage()] },
    }))

    const pt = { x: 10, y: 10 }
    SelectTool.onPointerDown(pt, pt, 10, { shift: false, ctrl: false })

    const { dragState, interactionMode, selectedIds } = useUIStore.getState()
    expect(selectedIds).toEqual(['img-1'])
    expect(interactionMode).toBe('multi')
    expect(dragState?.kind).toBe('multi')
    expect(dragState?.kind === 'multi' && dragState.imageIds).toEqual(['img-1'])
  })

  it('translates the image by the drag delta on pointer-up', () => {
    useProjectStore.setState((s) => ({
      project: { ...s.project, referenceImages: [makeReferenceImage()] },
    }))

    dragImage({ x: 10, y: 10 }, { x: 17, y: 13 })

    const img = useProjectStore.getState().project.referenceImages[0]
    expect(img.x).toBeCloseTo(7)
    expect(img.y).toBeCloseTo(3)
  })

  it('preserves width, height, rotation and calibrated scale across a drag', () => {
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        referenceImages: [
          makeReferenceImage({
            rotation: 30,
            calibration: { p1: { x: 2, y: 2 }, p2: { x: 12, y: 2 }, realWorldDistance: 10 },
          }),
        ],
      },
    }))

    dragImage({ x: 10, y: 10 }, { x: 15, y: 10 })

    const img = useProjectStore.getState().project.referenceImages[0]
    expect(img.width).toBe(20)
    expect(img.height).toBe(20)
    expect(img.rotation).toBe(30)
    expect(img.calibration?.realWorldDistance).toBe(10)
  })

  it('translates the calibration points along with the image', () => {
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        referenceImages: [
          makeReferenceImage({
            calibration: { p1: { x: 2, y: 2 }, p2: { x: 12, y: 2 }, realWorldDistance: 10 },
          }),
        ],
      },
    }))

    dragImage({ x: 10, y: 10 }, { x: 15, y: 14 })

    const calibration = useProjectStore.getState().project.referenceImages[0].calibration
    expect(calibration?.p1).toEqual({ x: 7, y: 6 })
    expect(calibration?.p2).toEqual({ x: 17, y: 6 })
  })

  it('excludes an item-locked or hidden image from the drag even when it is selected', () => {
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        rooms: [makeRoom()],
        referenceImages: [makeReferenceImage({ id: 'img-locked', locked: true })],
      },
    }))
    useUIStore.getState().setSelection(['room-1', 'img-locked'])

    const pt = { x: 10, y: 10 }
    SelectTool.onPointerDown(pt, pt, 10, { shift: false, ctrl: false })

    const { dragState } = useUIStore.getState()
    expect(dragState?.kind === 'multi' && dragState.imageIds).toEqual([])
  })

  it('drags a selected image and room together, preserving relative positions', () => {
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        rooms: [makeRoom()],
        referenceImages: [makeReferenceImage({ x: 4, y: 4 })],
      },
    }))
    useUIStore.getState().setSelection(['room-1', 'img-1'])

    dragImage({ x: 10, y: 10 }, { x: 16, y: 12 })

    const { project } = useProjectStore.getState()
    expect(project.referenceImages[0].x).toBeCloseTo(10)
    expect(project.referenceImages[0].y).toBeCloseTo(6)
    expect(project.rooms[0].points[0]).toEqual({ x: 6, y: 2 })
  })

  it('pushes exactly one history snapshot per image drag', () => {
    useProjectStore.setState((s) => ({
      project: { ...s.project, referenceImages: [makeReferenceImage()] },
    }))

    dragImage({ x: 10, y: 10 }, { x: 15, y: 15 })

    expect(useHistoryStore.getState().past).toHaveLength(1)
  })

  it('commits nothing and snapshots nothing when the drag does not move', () => {
    useProjectStore.setState((s) => ({
      project: { ...s.project, referenceImages: [makeReferenceImage()] },
    }))

    dragImage({ x: 10, y: 10 }, { x: 10, y: 10 })

    expect(useHistoryStore.getState().past).toHaveLength(0)
    expect(useProjectStore.getState().project.referenceImages[0].x).toBe(0)
  })
})

/** O1 (#41): a release outside the canvas used to leave the tool mid-gesture.
 * LayoutCanvas now captures the pointer so the release is delivered, but the
 * tool also has to survive a gesture whose pointer-up never arrived. */
describe('SelectTool stuck-gesture recovery (#41)', () => {
  const NO_MODS = { shift: false, ctrl: false }

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
        ...furnitureLayoutState([]),
        referenceImages: [],
        settings: { ...s.project.settings, snapToGrid: false },
      },
    }))
    useHistoryStore.setState({ past: [], future: [] })
  })

  it('leaves no stale dragState when a drag never gets its pointer-up and the next pointer-down lands elsewhere', () => {
    const furniture = makeFurniture({ id: 'furn-1', x: 10, y: 10 })
    useProjectStore.setState((s) => ({ project: { ...s.project, ...furnitureLayoutState([furniture]) } }))

    SelectTool.onPointerDown({ x: 13, y: 13 }, { x: 13, y: 13 }, 10, NO_MODS)
    SelectTool.onPointerMove({ x: 50, y: 50 }, 10, NO_MODS)
    expect(useUIStore.getState().dragState).toMatchObject({ kind: 'multi', dx: 37, dy: 37 })

    // No pointer-up. The next press is on empty canvas, away from the furniture.
    const elsewhere = { x: 200, y: 200 }
    SelectTool.onPointerDown(elsewhere, elsewhere, 10, NO_MODS)

    expect(useUIStore.getState().dragState).toBeNull()
    expect(useUIStore.getState().interactionMode).toBe('marquee')
    // Nothing was committed by the abandoned drag, so the entity is exactly
    // where hit-testing believes it is.
    expect(activeFurnitureInstances(useProjectStore.getState().project)[0]).toMatchObject({ x: 10, y: 10 })
    expect(useHistoryStore.getState().past).toHaveLength(0)
  })

  it('drops a stale marquee when the next pointer-down starts over', () => {
    SelectTool.onPointerDown({ x: 0, y: 0 }, { x: 0, y: 0 }, 10, NO_MODS)
    SelectTool.onPointerMove({ x: 40, y: 40 }, 10, NO_MODS)
    expect(useUIStore.getState().marquee).not.toBeNull()

    const furniture = makeFurniture({ id: 'furn-1', x: 100, y: 100 })
    useProjectStore.setState((s) => ({ project: { ...s.project, ...furnitureLayoutState([furniture]) } }))
    SelectTool.onPointerDown({ x: 103, y: 103 }, { x: 103, y: 103 }, 10, NO_MODS)

    expect(useUIStore.getState().marquee).toBeNull()
    expect(useUIStore.getState().interactionMode).toBe('multi')
  })

  it('does not move anything when the pointer moves after the gesture has ended', () => {
    const furniture = makeFurniture({ id: 'furn-1', x: 10, y: 10 })
    useProjectStore.setState((s) => ({ project: { ...s.project, ...furnitureLayoutState([furniture]) } }))

    SelectTool.onPointerDown({ x: 13, y: 13 }, { x: 13, y: 13 }, 10, NO_MODS)
    SelectTool.onPointerMove({ x: 30, y: 30 }, 10, NO_MODS)
    // LayoutCanvas ends the gesture at the last in-canvas position.
    SelectTool.onPointerUp({ x: 30, y: 30 }, 10, NO_MODS)
    SelectTool.onPointerMove({ x: 80, y: 80 }, 10, NO_MODS)

    expect(useUIStore.getState().dragState).toBeNull()
    expect(activeFurnitureInstances(useProjectStore.getState().project)[0]).toMatchObject({ x: 27, y: 27 })
    expect(useHistoryStore.getState().past).toHaveLength(1)
  })

  it('resolves a marquee as if released at its last position', () => {
    const furniture = makeFurniture({ id: 'furn-1', x: 10, y: 10 })
    useProjectStore.setState((s) => ({ project: { ...s.project, ...furnitureLayoutState([furniture]) } }))

    SelectTool.onPointerDown({ x: 0, y: 0 }, { x: 0, y: 0 }, 10, NO_MODS)
    SelectTool.onPointerMove({ x: 30, y: 30 }, 10, NO_MODS)
    SelectTool.onPointerUp({ x: 30, y: 30 }, 10, NO_MODS)

    expect(useUIStore.getState().selectedIds).toEqual(['furn-1'])
    expect(useUIStore.getState().marquee).toBeNull()
    expect(useUIStore.getState().interactionMode).toBe('idle')
  })
})
