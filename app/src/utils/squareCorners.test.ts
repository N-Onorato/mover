import { describe, expect, it } from 'vitest'
import type { InteriorWall, Point } from '../types/project'
import { squareRoom } from './squareCorners'
import type { SquareRoomResult } from './squareCorners'

const DEG = Math.PI / 180

/** Interior angle at every vertex, in degrees (0..180, orientation-free). */
function cornerAngles(points: Point[]): number[] {
  const n = points.length
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n]
    const next = points[(i + 1) % n]
    const v1 = { x: prev.x - p.x, y: prev.y - p.y }
    const v2 = { x: next.x - p.x, y: next.y - p.y }
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))
    return Math.acos(Math.max(-1, Math.min(1, cos))) / DEG
  })
}

function rotate(points: Point[], deg: number, about: Point = { x: 0, y: 0 }): Point[] {
  const c = Math.cos(deg * DEG)
  const s = Math.sin(deg * DEG)
  return points.map((p) => ({
    x: about.x + (p.x - about.x) * c - (p.y - about.y) * s,
    y: about.y + (p.x - about.x) * s + (p.y - about.y) * c,
  }))
}

function wall(id: string, a: Point, b: Point): InteriorWall {
  return { id, roomId: 'r', a, b, thickness: 4, locked: false, visible: true }
}

function expectOk(result: SquareRoomResult) {
  if (!result.ok) throw new Error(`expected ok, got refusal: ${result.reason}`)
  return result
}

/** Distance from pt to the segment ab. */
function distToSegment(pt: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy))
}

describe('squareRoom - perimeter', () => {
  it('squares a skewed rectangle to exact 90 degree corners', () => {
    // 240 x 180 with the corners knocked to 88.7 / 91.3 degrees by a shear.
    const skewed: Point[] = [
      { x: 0, y: 0 },
      { x: 240, y: 0 },
      { x: 240 + 180 * Math.tan(1.3 * DEG), y: 180 },
      { x: 180 * Math.tan(1.3 * DEG), y: 180 },
    ]
    const before = cornerAngles(skewed)
    expect(Math.max(...before.map((a) => Math.abs(a - 90)))).toBeGreaterThan(1)

    const result = expectOk(squareRoom(skewed, [], 5))
    expect(result.changed).toBe(true)
    for (const angle of cornerAngles(result.points)) expect(angle).toBeCloseTo(90, 9)
    // Wall lengths stay roughly what they were.
    const w = Math.hypot(result.points[1].x - result.points[0].x, result.points[1].y - result.points[0].y)
    const h = Math.hypot(result.points[2].x - result.points[1].x, result.points[2].y - result.points[1].y)
    expect(w).toBeGreaterThan(235)
    expect(w).toBeLessThan(245)
    expect(h).toBeGreaterThan(175)
    expect(h).toBeLessThan(185)
  })

  it('keeps the room rotated: squares to the room axes, not the world axes', () => {
    const tilted = rotate(
      [
        { x: 0, y: 0 },
        { x: 240, y: 3 },
        { x: 238, y: 183 },
        { x: -1, y: 180 },
      ],
      20,
    )
    const result = expectOk(squareRoom(tilted, [], 5))
    for (const angle of cornerAngles(result.points)) expect(angle).toBeCloseTo(90, 9)
    // Still tilted roughly 20 degrees from world X.
    const dir = Math.atan2(
      result.points[1].y - result.points[0].y,
      result.points[1].x - result.points[0].x,
    )
    expect(dir / DEG).toBeGreaterThan(18)
    expect(dir / DEG).toBeLessThan(25)
  })

  it('reports no change for an already-square room and returns the input untouched', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]
    const result = expectOk(squareRoom(square, [], 5))
    expect(result.changed).toBe(false)
    expect(result.points).toBe(square)
  })

  it('squares an L-shape including its reflex corner', () => {
    const lShape: Point[] = [
      { x: 0, y: 0 },
      { x: 200, y: 4 },
      { x: 203, y: 100 },
      { x: 98, y: 97 },
      { x: 101, y: 200 },
      { x: -2, y: 198 },
    ]
    const result = expectOk(squareRoom(lShape, [], 5))
    expect(result.changed).toBe(true)
    const angles = cornerAngles(result.points)
    expect(angles).toHaveLength(6)
    for (const angle of angles) expect(angle).toBeCloseTo(90, 9)
  })

  it('leaves an intentional 45 degree wall at its angle and squares the rest', () => {
    // A 100 x 100 room with the top-right corner cut off by a 45 degree wall,
    // and the other corners a couple of degrees off square.
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 70, y: 1.5 },
      { x: 100, y: 31.5 },
      { x: 101.5, y: 100 },
      { x: -1, y: 101 },
    ]
    const result = expectOk(squareRoom(pts, [], 5))
    expect(result.changed).toBe(true)
    const angles = cornerAngles(result.points)
    // The two corners at the chamfer are 135 degrees, within a hair of it
    // given the neighbors were already near-axis; they were not snapped to 90.
    expect(angles[1]).toBeGreaterThan(130)
    expect(angles[1]).toBeLessThan(140)
    expect(angles[2]).toBeGreaterThan(130)
    expect(angles[2]).toBeLessThan(140)
    // The remaining three corners are exact.
    expect(angles[0]).toBeCloseTo(90, 9)
    expect(angles[3]).toBeCloseTo(90, 9)
    expect(angles[4]).toBeCloseTo(90, 9)
    // The chamfer edge itself is still ~45 degrees.
    const dx = result.points[2].x - result.points[1].x
    const dy = result.points[2].y - result.points[1].y
    expect(Math.atan2(dy, dx) / DEG).toBeGreaterThan(40)
    expect(Math.atan2(dy, dx) / DEG).toBeLessThan(50)
  })

  it('leaves corners outside the tolerance alone', () => {
    // A 100 degree corner is outside +/- 5; nothing about this room is square.
    const parallelogram: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100 - 50 * Math.sin(10 * DEG), y: 50 * Math.cos(10 * DEG) },
      { x: -50 * Math.sin(10 * DEG), y: 50 * Math.cos(10 * DEG) },
    ]
    const result = expectOk(squareRoom(parallelogram, [], 5))
    expect(result.changed).toBe(false)
    expect(result.points).toBe(parallelogram)
  })

  it('respects the tolerance setting', () => {
    const skewed: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100 + 50 * Math.tan(3 * DEG), y: 50 },
      { x: 50 * Math.tan(3 * DEG), y: 50 },
    ]
    expect(expectOk(squareRoom(skewed, [], 1)).changed).toBe(false)
    expect(expectOk(squareRoom(skewed, [], 5)).changed).toBe(true)
    expect(expectOk(squareRoom(skewed, [], 0)).changed).toBe(false)
  })

  it('does not merge near-collinear vertices', () => {
    // A wall drawn as two slightly jittered segments keeps both vertices but
    // becomes straight.
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 1 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ]
    const result = expectOk(squareRoom(pts, [], 5))
    expect(result.points).toHaveLength(5)
    expect(result.points[0].y).toBeCloseTo(result.points[1].y, 9)
    expect(result.points[1].y).toBeCloseTo(result.points[2].y, 9)
    expect(cornerAngles(result.points)[1]).toBeCloseTo(180, 6)
  })

  it('refuses a room with a zero-length wall', () => {
    const result = squareRoom(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      [],
      5,
    )
    expect(result.ok).toBe(false)
  })

  it('refuses a room with fewer than three points or no area', () => {
    expect(
      squareRoom(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        [],
        5,
      ).ok,
    ).toBe(false)
    expect(
      squareRoom(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 100, y: 0 },
        ],
        [],
        5,
      ).ok,
    ).toBe(false)
  })

  it('refuses non-finite coordinates rather than propagating NaN', () => {
    expect(
      squareRoom(
        [
          { x: 0, y: 0 },
          { x: Number.NaN, y: 0 },
          { x: 100, y: 100 },
        ],
        [],
        5,
      ).ok,
    ).toBe(false)
  })

  it('refuses a near-degenerate wedge whose short end would balloon', () => {
    // 1000 long, 0.4 across at the right end, flaring to 70 at the left. Both
    // long walls are 4 degrees off the mean axis, so both would snap - and the
    // 0.4 end wall would stretch to 70, a different room entirely.
    const wedge: Point[] = [
      { x: 0, y: 0 },
      { x: 1000, y: 1000 * Math.tan(4 * DEG) },
      { x: 1000, y: 1000 * Math.tan(4 * DEG) + 0.4 },
      { x: 0, y: 1000 * Math.tan(4 * DEG) * 2 + 0.4 },
    ]
    const result = squareRoom(wedge, [], 5)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/too much|collapse|flip/)
  })
})

describe('squareRoom - interior walls', () => {
  const skewedRect: Point[] = [
    { x: 0, y: 0 },
    { x: 240, y: 4 },
    { x: 244, y: 184 },
    { x: 4, y: 180 },
  ]

  it('makes a near-perpendicular partition exactly perpendicular and keeps both ends on the perimeter', () => {
    // Partition from the midpoint of the top wall to the midpoint of the bottom wall.
    const top = { x: 120, y: 2 }
    const bottom = { x: 124, y: 182 }
    const result = expectOk(squareRoom(skewedRect, [wall('w1', top, bottom)], 5))
    const [w1] = result.walls
    const p = result.points

    // Perpendicular to the (squared) top wall.
    const topDir = { x: p[1].x - p[0].x, y: p[1].y - p[0].y }
    const wDir = { x: w1.b.x - w1.a.x, y: w1.b.y - w1.a.y }
    const cosTheta =
      (topDir.x * wDir.x + topDir.y * wDir.y) / (Math.hypot(topDir.x, topDir.y) * Math.hypot(wDir.x, wDir.y))
    expect(cosTheta).toBeCloseTo(0, 9)

    // Endpoints still lie on the perimeter edges they were on.
    expect(distToSegment(w1.a, p[0], p[1])).toBeLessThan(1e-6)
    expect(distToSegment(w1.b, p[2], p[3])).toBeLessThan(1e-6)
  })

  it('makes a near-parallel partition exactly parallel to a wall', () => {
    const left = { x: 2, y: 90 }
    const right = { x: 242, y: 94 }
    const result = expectOk(squareRoom(skewedRect, [wall('w1', left, right)], 5))
    const p = result.points
    const [w1] = result.walls
    const topDir = { x: p[1].x - p[0].x, y: p[1].y - p[0].y }
    const wDir = { x: w1.b.x - w1.a.x, y: w1.b.y - w1.a.y }
    const crossProduct = topDir.x * wDir.y - topDir.y * wDir.x
    expect(crossProduct / (Math.hypot(topDir.x, topDir.y) * Math.hypot(wDir.x, wDir.y))).toBeCloseTo(0, 9)
    expect(distToSegment(w1.a, p[3], p[0])).toBeLessThan(1e-6)
    expect(distToSegment(w1.b, p[1], p[2])).toBeLessThan(1e-6)
  })

  it('keeps a wall attached to a perimeter vertex', () => {
    // From the top-left corner straight down-ish along the left side.
    const result = expectOk(
      squareRoom(skewedRect, [wall('w1', { x: 0, y: 0 }, { x: 120, y: 92 })], 5),
    )
    // That wall is a diagonal (~38 degrees): outside tolerance, so it is not
    // squared, but it must follow the vertex.
    expect(result.walls[0].a.x).toBeCloseTo(result.points[0].x, 9)
    expect(result.walls[0].a.y).toBeCloseTo(result.points[0].y, 9)
  })

  it('leaves an interior wall at an intentional angle alone (but attached)', () => {
    const result = expectOk(
      squareRoom(skewedRect, [wall('w1', { x: 60, y: 1 }, { x: 2, y: 90 })], 5),
    )
    const w1 = result.walls[0]
    const p = result.points
    const dir = Math.atan2(w1.b.y - w1.a.y, w1.b.x - w1.a.x) / DEG
    // Was ~122 degrees from the top wall; stays far from any axis.
    expect(Math.abs(dir) % 90).toBeGreaterThan(10)
    expect(distToSegment(w1.a, p[0], p[1])).toBeLessThan(1e-6)
    expect(distToSegment(w1.b, p[3], p[0])).toBeLessThan(1e-6)
  })

  it('keeps a T-junction between two interior walls attached', () => {
    // Vertical partition top to bottom, plus a horizontal wall from its body to the right edge.
    const vertical = wall('v', { x: 120, y: 2 }, { x: 124, y: 182 })
    const joinPt = { x: 122, y: 92 }
    const horizontal = wall('h', joinPt, { x: 242, y: 94 })
    const result = expectOk(squareRoom(skewedRect, [vertical, horizontal], 5))
    const [v, h] = result.walls
    expect(distToSegment(h.a, v.a, v.b)).toBeLessThan(1e-6)
    expect(distToSegment(h.b, result.points[1], result.points[2])).toBeLessThan(1e-6)
    // Exactly perpendicular to each other.
    const vd = { x: v.b.x - v.a.x, y: v.b.y - v.a.y }
    const hd = { x: h.b.x - h.a.x, y: h.b.y - h.a.y }
    expect((vd.x * hd.x + vd.y * hd.y) / (Math.hypot(vd.x, vd.y) * Math.hypot(hd.x, hd.y))).toBeCloseTo(
      0,
      9,
    )
  })

  it('squares a free-floating pony wall about its midpoint, keeping its length', () => {
    const pony = wall('p', { x: 100, y: 100 }, { x: 140, y: 103 })
    const result = expectOk(squareRoom(skewedRect, [pony], 5))
    const p = result.walls[0]
    const length = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y)
    expect(length).toBeCloseTo(Math.hypot(40, 3), 9)
    // Axis-aligned to the room: parallel to the squared top wall.
    const top = { x: result.points[1].x - result.points[0].x, y: result.points[1].y - result.points[0].y }
    const crossProduct = top.x * (p.b.y - p.a.y) - top.y * (p.b.x - p.a.x)
    expect(crossProduct / (Math.hypot(top.x, top.y) * length)).toBeCloseTo(0, 9)
    // Midpoint unchanged.
    expect((p.a.x + p.b.x) / 2).toBeCloseTo(120, 9)
    expect((p.a.y + p.b.y) / 2).toBeCloseTo(101.5, 9)
  })

  it('returns walls in input order and preserves their other fields', () => {
    const w1 = wall('w1', { x: 120, y: 2 }, { x: 124, y: 182 })
    const w2 = wall('w2', { x: 100, y: 100 }, { x: 140, y: 103 })
    const result = expectOk(squareRoom(skewedRect, [w1, w2], 5))
    expect(result.walls.map((w) => w.id)).toEqual(['w1', 'w2'])
    expect(result.walls[0].thickness).toBe(4)
  })

  it('does not move walls when the perimeter has nothing to square', () => {
    const parallelogram: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100 - 50 * Math.sin(10 * DEG), y: 50 * Math.cos(10 * DEG) },
      { x: -50 * Math.sin(10 * DEG), y: 50 * Math.cos(10 * DEG) },
    ]
    const walls = [wall('w1', { x: 50, y: 0 }, { x: 45, y: 49 })]
    const result = expectOk(squareRoom(parallelogram, walls, 5))
    expect(result.changed).toBe(false)
    expect(result.walls).toBe(walls)
  })
})
