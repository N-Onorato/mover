import { describe, expect, it } from 'vitest'
import type { FurnitureInstance, InteriorWall, ReferenceImage, Room } from '../../types/project'
import {
  normalizeDegrees,
  normalizeDelta,
  pointInRect,
  rectCenter,
  rotateFurniture,
  rotateImage,
  rotateInteriorWall,
  rotatePoints,
  rotateSelectionPatches,
  rotationDeltaFromPointer,
  selectionBounds,
  selectionBoxRect,
  selectionRotateHandle,
} from './multiRotate'

function makeFurniture(patch: Partial<FurnitureInstance> = {}): FurnitureInstance {
  return {
    id: 'furn-1',
    definitionId: 'def-1',
    x: 10,
    y: -3,
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
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ],
    wallThickness: 4,
    fillColor: '#eee',
    wallColor: '#333',
    locked: false,
    visible: true,
    ...patch,
  }
}

function makeWall(patch: Partial<InteriorWall> = {}): InteriorWall {
  return {
    id: 'wall-1',
    roomId: 'room-1',
    a: { x: 10, y: 0 },
    b: { x: 20, y: 0 },
    thickness: 4,
    locked: false,
    visible: true,
    ...patch,
  }
}

function makeImage(patch: Partial<ReferenceImage> = {}): ReferenceImage {
  return {
    id: 'img-1',
    name: 'Reference Image',
    src: '',
    x: 10,
    y: -5,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 0.6,
    locked: false,
    visible: true,
    calibration: null,
    ...patch,
  }
}

describe('degree normalization', () => {
  it('wraps degrees into [0, 360)', () => {
    expect(normalizeDegrees(0)).toBe(0)
    expect(normalizeDegrees(360)).toBe(0)
    expect(normalizeDegrees(365)).toBe(5)
    expect(normalizeDegrees(-15)).toBe(345)
  })

  it('wraps a delta into (-180, 180]', () => {
    expect(normalizeDelta(190)).toBe(-170)
    expect(normalizeDelta(-190)).toBe(170)
    expect(normalizeDelta(180)).toBe(180)
    expect(normalizeDelta(-180)).toBe(180)
    expect(normalizeDelta(0)).toBe(0)
  })
})

describe('rotationDeltaFromPointer', () => {
  const pivot = { x: 0, y: 0 }

  it('is 0 with the pointer straight above the pivot, where the handle sits', () => {
    expect(rotationDeltaFromPointer(pivot, { x: 0, y: -50 }, false)).toBeCloseTo(0)
  })

  it('turns clockwise as the pointer sweeps right, down, then left', () => {
    expect(rotationDeltaFromPointer(pivot, { x: 50, y: 0 }, false)).toBeCloseTo(90)
    expect(rotationDeltaFromPointer(pivot, { x: 0, y: 50 }, false)).toBeCloseTo(180)
    expect(rotationDeltaFromPointer(pivot, { x: -50, y: 0 }, false)).toBeCloseTo(-90)
  })

  it('snaps to 15 degree increments when snapping is on', () => {
    // 20 degrees clockwise of straight up.
    const rad = (20 * Math.PI) / 180
    const pointer = { x: 50 * Math.sin(rad), y: -50 * Math.cos(rad) }
    expect(rotationDeltaFromPointer(pivot, pointer, false)).toBeCloseTo(20)
    expect(rotationDeltaFromPointer(pivot, pointer, true)).toBe(15)
  })

  it('never snaps to 360 or -180', () => {
    expect(rotationDeltaFromPointer(pivot, { x: -1, y: -50 }, true)).toBeCloseTo(0)
    expect(rotationDeltaFromPointer(pivot, { x: -0.001, y: 50 }, true)).toBe(180)
  })
})

describe('selectionBounds', () => {
  it('is null for an empty selection', () => {
    expect(selectionBounds({ rooms: [], walls: [], furniture: [], images: [] })).toBeNull()
  })

  it('covers room points, wall endpoints, furniture and image boxes together', () => {
    const bounds = selectionBounds({
      rooms: [makeRoom()], // x 10..20, y 0..10
      walls: [makeWall({ a: { x: 30, y: 5 }, b: { x: 40, y: 5 } })],
      furniture: [makeFurniture({ x: 0, y: 20, width: 6, depth: 4 })], // x 0..6, y 20..24
      images: [makeImage({ x: 12, y: -8, width: 4, height: 4 })], // y -8..-4
    })
    expect(bounds).toEqual({ x: 0, y: -8, width: 40, height: 32 })
  })

  it('uses the rotated corners of furniture, not its unrotated box', () => {
    // 10 x 2 box centered at the origin, turned 90 degrees: 2 wide, 10 tall.
    const bounds = selectionBounds({
      rooms: [],
      walls: [],
      furniture: [makeFurniture({ x: -5, y: -1, width: 10, depth: 2, rotation: 90 })],
      images: [],
    })
    expect(bounds!.x).toBeCloseTo(-1)
    expect(bounds!.y).toBeCloseTo(-5)
    expect(bounds!.width).toBeCloseTo(2)
    expect(bounds!.height).toBeCloseTo(10)
  })

  it('uses the rotated corners of an image', () => {
    const bounds = selectionBounds({
      rooms: [],
      walls: [],
      furniture: [],
      images: [makeImage({ x: -5, y: -1, width: 10, height: 2, rotation: 90 })],
    })
    expect(bounds!.width).toBeCloseTo(2)
    expect(bounds!.height).toBeCloseTo(10)
  })
})

describe('selection box geometry', () => {
  it('pads by a fixed pixel margin that shrinks in world units as you zoom in, keeping the center', () => {
    const bounds = { x: 0, y: 0, width: 10, height: 20 }
    const at10 = selectionBoxRect(bounds, 10)
    const at20 = selectionBoxRect(bounds, 20)
    expect(at10.width).toBeGreaterThan(at20.width)
    expect(rectCenter(at10)).toEqual({ x: 5, y: 10 })
    expect(rectCenter(at20)).toEqual({ x: 5, y: 10 })
  })

  it('gives a zero-height selection (collinear walls) a hittable box', () => {
    const rect = selectionBoxRect({ x: 0, y: 5, width: 10, height: 0 }, 10)
    expect(rect.height).toBeGreaterThan(0)
    expect(pointInRect({ x: 5, y: 5 }, rect)).toBe(true)
    expect(pointInRect({ x: 5, y: 50 }, rect)).toBe(false)
  })

  it('places the rotate handle centered above the top edge by a fixed pixel offset', () => {
    const handle = selectionRotateHandle({ x: 0, y: 10, width: 20, height: 20 }, 10)
    expect(handle.x).toBe(10)
    expect(handle.y).toBeLessThan(10)
    expect(10 - handle.y).toBeCloseTo(2.4) // 24px at 10px per unit
  })
})

describe('rotating entities about a pivot', () => {
  const pivot = { x: 0, y: 0 }

  it('rotates room points rigidly, preserving every edge length', () => {
    const room = makeRoom()
    const out = rotatePoints(room.points, pivot, 90)
    // (10,0) -> (0,10); (20,0) -> (0,20); (20,10) -> (-10,20); (10,10) -> (-10,10)
    expect(out[0].x).toBeCloseTo(0)
    expect(out[0].y).toBeCloseTo(10)
    expect(out[2].x).toBeCloseTo(-10)
    expect(out[2].y).toBeCloseTo(20)
    const len = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y)
    for (let i = 0; i < 4; i++) {
      expect(len(out[i], out[(i + 1) % 4])).toBeCloseTo(len(room.points[i], room.points[(i + 1) % 4]))
    }
  })

  it('rotates both interior-wall endpoints and leaves thickness out of it', () => {
    const out = rotateInteriorWall(makeWall(), pivot, 90)
    expect(out.a.x).toBeCloseTo(0)
    expect(out.a.y).toBeCloseTo(10)
    expect(out.b.x).toBeCloseTo(0)
    expect(out.b.y).toBeCloseTo(20)
    expect(Object.keys(out).sort()).toEqual(['a', 'b'])
  })

  it('orbits furniture center about the pivot and adds the delta to its own rotation', () => {
    // Box center (13, 0) turns to (0, 13); x/y are the top-left of the
    // unrotated box, so they land 3 up/left of that center.
    const out = rotateFurniture(makeFurniture(), pivot, 90)
    expect(out.x).toBeCloseTo(-3)
    expect(out.y).toBeCloseTo(10)
    expect(out.rotation).toBeCloseTo(90)
  })

  it('keeps furniture rotation in [0, 360) and handles negative deltas', () => {
    expect(rotateFurniture(makeFurniture({ rotation: 350 }), pivot, 30).rotation).toBeCloseTo(20)
    expect(rotateFurniture(makeFurniture({ rotation: 10 }), pivot, -30).rotation).toBeCloseTo(340)
  })

  it('keeps the furniture-to-pivot distance and the rendered corners consistent with a rigid turn', () => {
    const f = makeFurniture({ rotation: 30 })
    const out = rotateFurniture(f, pivot, 45)
    const before = { x: f.x + f.width / 2, y: f.y + f.depth / 2 }
    const after = { x: out.x + f.width / 2, y: out.y + f.depth / 2 }
    expect(Math.hypot(after.x, after.y)).toBeCloseTo(Math.hypot(before.x, before.y))
    expect(out.rotation).toBeCloseTo(75)
  })

  it('rotates a reference image the same way and carries its calibration points along', () => {
    const img = makeImage({
      calibration: { p1: { x: 10, y: 0 }, p2: { x: 20, y: 0 }, realWorldDistance: 10 },
    })
    const out = rotateImage(img, pivot, 90)
    // center (15, 0) -> (0, 15)
    expect(out.x).toBeCloseTo(-5)
    expect(out.y).toBeCloseTo(10)
    expect(out.rotation).toBeCloseTo(90)
    expect(out.calibration!.p1.x).toBeCloseTo(0)
    expect(out.calibration!.p1.y).toBeCloseTo(10)
    expect(out.calibration!.p2.x).toBeCloseTo(0)
    expect(out.calibration!.p2.y).toBeCloseTo(20)
    // Rotation is rigid: the calibrated length survives.
    expect(out.calibration!.realWorldDistance).toBe(10)
    expect(Math.hypot(out.calibration!.p2.x - out.calibration!.p1.x, out.calibration!.p2.y - out.calibration!.p1.y)).toBeCloseTo(10)
  })

  it('leaves an uncalibrated image uncalibrated', () => {
    expect(rotateImage(makeImage(), pivot, 15).calibration).toBeNull()
  })

  it('four quarter turns bring furniture back to where it started', () => {
    let f = makeFurniture({ rotation: 20 })
    for (let i = 0; i < 4; i++) f = { ...f, ...rotateFurniture(f, { x: 3, y: 4 }, 90) }
    expect(f.x).toBeCloseTo(10)
    expect(f.y).toBeCloseTo(-3)
    expect(f.rotation).toBeCloseTo(20)
  })
})

describe('rotateSelectionPatches', () => {
  it('returns patches only for targeted entities, across all four types', () => {
    const rooms = [makeRoom({ id: 'room-1' }), makeRoom({ id: 'room-other' })]
    const furniture = [makeFurniture({ id: 'f1' }), makeFurniture({ id: 'f-other' })]
    const walls = [makeWall({ id: 'w1' }), makeWall({ id: 'w-other' })]
    const images = [makeImage({ id: 'i1' }), makeImage({ id: 'i-other' })]

    const patches = rotateSelectionPatches(
      { rooms, furniture, walls, images },
      { roomIds: ['room-1'], furnitureIds: ['f1'], wallIds: ['w1'], imageIds: ['i1', 'i-missing'] },
      { x: 0, y: 0 },
      90,
    )

    expect(patches.rooms.map((r) => r.id)).toEqual(['room-1'])
    expect(patches.furniture.map((f) => f.id)).toEqual(['f1'])
    expect(patches.walls.map((w) => w.id)).toEqual(['w1'])
    expect(patches.images.map((i) => i.id)).toEqual(['i1'])
    expect(patches.rooms[0].points[0].y).toBeCloseTo(10)
    expect(patches.furniture[0].patch.rotation).toBeCloseTo(90)
  })

  it('keeps relative positions: the same rigid turn applied to every member', () => {
    const f1 = makeFurniture({ id: 'f1', x: 0, y: 0, width: 2, depth: 2 })
    const f2 = makeFurniture({ id: 'f2', x: 10, y: 0, width: 2, depth: 2 })
    const patches = rotateSelectionPatches(
      { rooms: [], furniture: [f1, f2], walls: [], images: [] },
      { roomIds: [], furnitureIds: ['f1', 'f2'], wallIds: [], imageIds: [] },
      { x: 6, y: 1 },
      180,
    )
    // 180 about the midpoint swaps the two pieces.
    expect(patches.furniture[0].patch.x).toBeCloseTo(10)
    expect(patches.furniture[0].patch.y).toBeCloseTo(0)
    expect(patches.furniture[1].patch.x).toBeCloseTo(0)
    expect(patches.furniture[1].patch.y).toBeCloseTo(0)
  })
})
