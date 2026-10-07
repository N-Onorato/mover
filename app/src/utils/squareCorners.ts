import type { InteriorWall, Point } from '../types/project'

/** O3 (#43): squaring up near-90-degree room corners and the interior walls
 * that hang off them.
 *
 * Pure geometry - no store access. `squareRoom` takes a room's perimeter and
 * its interior walls and returns the corrected geometry, or a reason it
 * refused. The store action (`squareRooms` in projectStore) applies it.
 *
 * Approach, per the issue's algorithm notes:
 *   1. Find one reference orientation for the whole room.
 *   2. Every edge within tolerance of that orientation's axes is rotated (about
 *      its midpoint) onto the nearest axis; every other edge keeps its line.
 *   3. Vertices are re-solved as intersections of consecutive edge lines.
 *      Because each vertex depends only on its two adjacent lines, error cannot
 *      accumulate around the loop the way a vertex-by-vertex fix would.
 *   4. Interior walls are snapped the same way, then their endpoints are
 *      re-attached to whatever they touched before (perimeter vertex, perimeter
 *      edge, another interior wall).
 *   5. The result is validated; anything that would corrupt the room is refused
 *      rather than applied. */

/** Default tolerance in degrees. Shared by the store's new-project settings and
 * the load-time backfill of older files. */
export const DEFAULT_SQUARE_CORNERS_TOLERANCE_DEG = 5

/** Upper bound the Settings panel accepts. Past this the "near-orthogonal"
 * premise stops holding (two edges each 20 degrees off axis could be 40
 * degrees apart), so larger values are clamped rather than trusted. */
export const MAX_SQUARE_CORNERS_TOLERANCE_DEG = 20

export type SquareRoomResult =
  | {
      ok: true
      /** False when every coordinate already matched (within CHANGE_EPS). In
       * that case `points` and `walls` are the input arrays, untouched. */
      changed: boolean
      points: Point[]
      /** Same order and length as the input walls; unchanged walls are the
       * original objects. */
      walls: InteriorWall[]
      /** Walls that were within tolerance of the room's axes but could not be
       * made exactly axis-aligned without breaking an attachment. They were
       * moved only as far as keeping their attachments required. */
      skippedWalls: number
    }
  | { ok: false; reason: string }

const DEG = Math.PI / 180

/** An edge shorter than this has no meaningful direction at all: refuse. */
const MIN_EDGE = 1e-3
/** Edges shorter than this keep their original line instead of being snapped:
 * their angle is dominated by drawing noise. Units are world units (in / cm). */
const MIN_SNAP_EDGE = 0.5
/** How close an interior-wall endpoint must be to the perimeter or another
 * wall to count as attached. InteriorWallTool snaps to exact points, so real
 * attachments are far tighter than this; the slack covers hand-edited files. */
const ATTACH_EPS = 0.05
/** Anything that moves less than this is float noise, not a change. */
const CHANGE_EPS = 1e-7
/** Float slack when comparing an angle against the tolerance. */
const ANGLE_EPS = 1e-9
/** Edge-length ratio (new / original) outside this means the squared room
 * would be a different shape, not a corrected one. */
const MIN_LENGTH_RATIO = 0.1
const MAX_LENGTH_RATIO = 10
/** Same idea for the polygon as a whole. */
const MIN_AREA_RATIO = 0.5
const MAX_AREA_RATIO = 2
/** |sin| of the angle between two lines below which they are treated as
 * parallel (no usable intersection). */
const PARALLEL_SIN = 1e-6
/** A wall endpoint is pinned to a carrier line by intersection only when the
 * wall crosses it at a meaningful angle; otherwise it is projected. */
const CROSSING_SIN = 0.2

function wrap180(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}

function scale(a: Point, s: number): Point {
  return { x: a.x * s, y: a.y * s }
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x
}

function len(a: Point): number {
  return Math.hypot(a.x, a.y)
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function angleOf(v: Point): number {
  return Math.atan2(v.y, v.x) / DEG
}

/** Unit vector for axis `k` (0..3) of a frame rotated `refDeg` from world X.
 * The four are written out rather than computed from cos/sin of k*90 so that
 * perpendicular axes are perpendicular exactly (a dot product of cos*sin
 * terms that cancel), not to within 1e-16. */
function axisDir(refDeg: number, k: number): Point {
  const c = Math.cos(refDeg * DEG)
  const s = Math.sin(refDeg * DEG)
  switch (((k % 4) + 4) % 4) {
    case 0:
      return { x: c, y: s }
    case 1:
      return { x: -s, y: c }
    case 2:
      return { x: -c, y: -s }
    default:
      return { x: s, y: -c }
  }
}

/** Nearest axis of the reference frame for a direction at `thetaDeg`, and how
 * far (degrees, >= 0) the direction is from it. */
function nearestAxis(thetaDeg: number, refDeg: number): { k: number; dev: number } {
  const delta = wrap180(thetaDeg - refDeg)
  const k = Math.round(delta / 90)
  return { k: ((k % 4) + 4) % 4, dev: Math.abs(delta - 90 * k) }
}

/** Length-weighted circular mean of angles modulo 90 degrees, in degrees
 * (-45, 45]. Multiplying by 4 makes "mod 90" periodic over a full turn, so
 * 89 and 1 average to 0 rather than 45. Returns null when the contributions
 * cancel (e.g. a regular octagon) and there is no dominant orientation. */
function weightedAxisMean(thetas: number[], weights: number[]): number | null {
  let sx = 0
  let sy = 0
  let total = 0
  for (let i = 0; i < thetas.length; i++) {
    const a = 4 * thetas[i] * DEG
    sx += weights[i] * Math.cos(a)
    sy += weights[i] * Math.sin(a)
    total += weights[i]
  }
  if (total === 0 || Math.hypot(sx, sy) < 1e-9 * total) return null
  return Math.atan2(sy, sx) / 4 / DEG
}

interface Line {
  /** A point on the line. */
  p: Point
  /** Unit direction. */
  d: Point
}

/** Intersection of two lines, or null when they are (nearly) parallel. */
function intersect(l1: Line, l2: Line): Point | null {
  const denom = cross(l1.d, l2.d)
  if (Math.abs(denom) < PARALLEL_SIN) return null
  const t = cross(sub(l2.p, l1.p), l2.d) / denom
  return add(l1.p, scale(l1.d, t))
}

function projectOntoLine(pt: Point, line: Line): Point {
  return add(line.p, scale(line.d, dot(sub(pt, line.p), line.d)))
}

function distanceToSegment(pt: Point, a: Point, b: Point): number {
  const ab = sub(b, a)
  const lenSq = dot(ab, ab)
  if (lenSq === 0) return len(sub(pt, a))
  const t = Math.max(0, Math.min(1, dot(sub(pt, a), ab) / lenSq))
  return len(sub(pt, lerp(a, b, t)))
}

/** Parameter of the closest point on segment ab to pt, clamped to [0, 1]. */
function segmentParam(pt: Point, a: Point, b: Point): number {
  const ab = sub(b, a)
  const lenSq = dot(ab, ab)
  if (lenSq === 0) return 0
  return Math.max(0, Math.min(1, dot(sub(pt, a), ab) / lenSq))
}

function signedArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return area / 2
}

/** True when segments ab and cd properly cross (touching ends do not count -
 * adjacent edges always touch, and a T-touch is not what this guards against). */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(sub(b, a), sub(c, a))
  const d2 = cross(sub(b, a), sub(d, a))
  const d3 = cross(sub(d, c), sub(a, c))
  const d4 = cross(sub(d, c), sub(b, c))
  return d1 * d2 < 0 && d3 * d4 < 0
}

function isSimplePolygon(points: Point[]): boolean {
  const n = points.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Edges sharing a vertex can't properly cross.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (segmentsCross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) {
        return false
      }
    }
  }
  return true
}

function allFinite(points: Point[]): boolean {
  return points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= CHANGE_EPS && Math.abs(a.y - b.y) <= CHANGE_EPS
}

// --- Perimeter -------------------------------------------------------------

interface PerimeterResult {
  ok: true
  points: Point[]
  refDeg: number
  /** Whether any edge was snapped; false means there was nothing to do. */
  anySnapped: boolean
}

function squarePerimeter(points: Point[], tolDeg: number): PerimeterResult | { ok: false; reason: string } {
  const n = points.length
  const edges: { a: Point; b: Point; v: Point; length: number; theta: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    const v = sub(b, a)
    const length = len(v)
    if (!(length >= MIN_EDGE)) {
      return { ok: false, reason: 'The room has a zero-length wall. Remove the duplicate point first.' }
    }
    edges.push({ a, b, v, length, theta: angleOf(v) })
  }
  if (Math.abs(signedArea(points)) < 1e-6) {
    return { ok: false, reason: 'The room has no area, so there is nothing to square.' }
  }

  // Reference orientation: length-weighted circular mean of the edge angles
  // mod 90. Weighting by length means a long wall counts more than a short
  // jog, but (unlike "use the longest wall") one dominant wall cannot drag the
  // whole room off axis when the other walls agree with each other.
  //
  // Two passes: the first over every edge is skewed by intentional angled
  // walls (a 46-degree bay pulls the mean slightly); the second re-fits using
  // only edges within 2x tolerance of the first answer, i.e. the walls that are
  // plausibly meant to be orthogonal.
  const usable = edges.map((e) => e.length >= MIN_SNAP_EDGE)
  const thetas = edges.map((e) => e.theta)
  const weights = edges.map((e, i) => (usable[i] ? e.length : 0))
  let refDeg = weightedAxisMean(thetas, weights)
  if (refDeg === null) {
    // No dominant orientation (contributions cancel). Fall back to the longest
    // wall, which is at least a deterministic choice.
    let longest = 0
    for (let i = 1; i < n; i++) if (edges[i].length > edges[longest].length) longest = i
    refDeg = edges[longest].theta
  }
  const firstRef = refDeg
  const refined = weightedAxisMean(
    thetas,
    weights.map((w, i) => (nearestAxis(thetas[i], firstRef).dev <= 2 * tolDeg ? w : 0)),
  )
  if (refined !== null) refDeg = refined

  // Which edges snap, and to which axis.
  const axis = edges.map((e) => nearestAxis(e.theta, refDeg))
  const snapped = edges.map((_, i) => usable[i] && axis[i].dev <= tolDeg + ANGLE_EPS)

  // A corner is only squared when its own angle is within tolerance of 90 (or
  // of 180 for two edges that land on the same axis). Being close to the
  // reference is necessary but not sufficient: two edges each 4 degrees off in
  // opposite directions form a corner 8 degrees off, which should be left
  // alone. When a pair fails, drop the edge that is further from its axis and
  // re-check - this only ever removes snapped edges, so it terminates.
  //
  // An edge that ends up with no snapped neighbor is dropped too: there is no
  // corner left to square, and rotating it alone would only tilt a wall for
  // the sake of a reference orientation (a 100/80 degree parallelogram would
  // otherwise have its top and bottom walls rotated by the mean skew).
  let again = true
  while (again) {
    again = false
    for (let i = 0; i < n; i++) {
      if (snapped[i] && !snapped[(i + 1) % n] && !snapped[(i - 1 + n) % n]) {
        snapped[i] = false
        again = true
      }
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      if (!snapped[i] || !snapped[j]) continue
      const turn = Math.abs(wrap180(edges[j].theta - edges[i].theta))
      const dk = (axis[j].k - axis[i].k + 4) % 4
      const ok =
        dk === 0
          ? turn <= tolDeg + ANGLE_EPS
          : dk === 1 || dk === 3
            ? Math.abs(turn - 90) <= tolDeg + ANGLE_EPS
            : false
      if (!ok) {
        snapped[axis[i].dev > axis[j].dev ? i : j] = false
        again = true
      }
    }
  }

  if (!snapped.some(Boolean)) return { ok: true, points, refDeg, anySnapped: false }

  // Chains: runs of consecutive snapped edges on the same axis (a wall drawn
  // as several slightly jittered segments). They collapse onto one shared line
  // through their length-weighted centroid; the vertices between them are
  // kept (projected onto that line), not merged.
  const chainOf: number[] = new Array(n).fill(-1)
  const chainLines: Line[] = []
  const sameChain = (i: number, j: number) =>
    snapped[i] && snapped[j] && (axis[j].k - axis[i].k + 4) % 4 === 0
  // Start from an edge that begins a chain so a run wrapping past index n-1
  // is walked as one chain.
  let start = -1
  for (let i = 0; i < n; i++) {
    if (snapped[i] && !sameChain((i - 1 + n) % n, i)) {
      start = i
      break
    }
  }
  if (start === -1) {
    return { ok: false, reason: 'The room outline has no corners to square.' }
  }
  for (let step = 0; step < n; step++) {
    const i = (start + step) % n
    if (!snapped[i]) continue
    if (step > 0 && sameChain((i - 1 + n) % n, i)) {
      chainOf[i] = chainOf[(i - 1 + n) % n]
      continue
    }
    chainOf[i] = chainLines.length
    chainLines.push({ p: { x: 0, y: 0 }, d: axisDir(refDeg, axis[i].k) })
  }
  const sums = chainLines.map(() => ({ x: 0, y: 0, w: 0 }))
  for (let i = 0; i < n; i++) {
    if (chainOf[i] < 0) continue
    const mid = lerp(edges[i].a, edges[i].b, 0.5)
    const s = sums[chainOf[i]]
    s.x += mid.x * edges[i].length
    s.y += mid.y * edges[i].length
    s.w += edges[i].length
  }
  chainLines.forEach((line, c) => {
    line.p = { x: sums[c].x / sums[c].w, y: sums[c].y / sums[c].w }
  })

  const edgeLine = (i: number): Line =>
    chainOf[i] >= 0 ? chainLines[chainOf[i]] : { p: edges[i].a, d: scale(edges[i].v, 1 / edges[i].length) }

  // Vertex j joins edge j-1 and edge j.
  const next: Point[] = []
  for (let j = 0; j < n; j++) {
    const prev = (j - 1 + n) % n
    if (!snapped[prev] && !snapped[j]) {
      next.push(points[j])
    } else if (chainOf[prev] >= 0 && chainOf[prev] === chainOf[j]) {
      next.push(projectOntoLine(points[j], chainLines[chainOf[j]]))
    } else {
      const hit = intersect(edgeLine(prev), edgeLine(j))
      if (!hit) {
        return {
          ok: false,
          reason: 'Two walls would end up parallel, so their corner cannot be re-solved.',
        }
      }
      next.push(hit)
    }
  }

  return { ok: true, points: next, refDeg, anySnapped: true }
}

/** Reject results that are a different room rather than a corrected one. */
function validatePerimeter(before: Point[], after: Point[]): string | null {
  if (!allFinite(after)) return 'Squaring produced an invalid outline.'
  const n = before.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const oldV = sub(before[j], before[i])
    const newV = sub(after[j], after[i])
    const newLen = len(newV)
    if (newLen < MIN_EDGE || dot(oldV, newV) <= 0) {
      return 'Squaring would collapse or flip one of the walls.'
    }
    const ratio = newLen / len(oldV)
    if (ratio < MIN_LENGTH_RATIO || ratio > MAX_LENGTH_RATIO) {
      return 'Squaring would change a wall length too much.'
    }
  }
  const oldArea = signedArea(before)
  const newArea = signedArea(after)
  const areaRatio = newArea / oldArea
  if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) {
    return 'Squaring would change the room area too much.'
  }
  // Only blame squaring for a self-intersection it introduced.
  if (isSimplePolygon(before) && !isSimplePolygon(after)) {
    return 'Squaring would make the room outline cross itself.'
  }
  return null
}

// --- Interior walls --------------------------------------------------------

/** What one wall endpoint was touching before the operation. Detected on the
 * original geometry, then re-established on the squared geometry. */
type Attach =
  | { kind: 'vertex'; index: number }
  | { kind: 'wallEnd'; wall: number; end: 'a' | 'b' }
  | { kind: 'edge'; index: number; t: number }
  | { kind: 'wallBody'; wall: number; s: number }
  | { kind: 'free' }

/** Same priority as InteriorWallTool.snapPoint: exact junctions (vertices, wall
 * endpoints) before mid-edge tees. A wall endpoint only attaches to a
 * lower-numbered wall's endpoint, so two walls meeting at a shared free point
 * don't each wait on the other. */
function classifyEndpoint(
  pt: Point,
  self: number,
  points: Point[],
  walls: InteriorWall[],
): Attach {
  const n = points.length
  for (let i = 0; i < n; i++) {
    if (len(sub(pt, points[i])) <= ATTACH_EPS) return { kind: 'vertex', index: i }
  }
  for (let w = 0; w < self; w++) {
    if (len(sub(pt, walls[w].a)) <= ATTACH_EPS) return { kind: 'wallEnd', wall: w, end: 'a' }
    if (len(sub(pt, walls[w].b)) <= ATTACH_EPS) return { kind: 'wallEnd', wall: w, end: 'b' }
  }
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    if (distanceToSegment(pt, a, b) <= ATTACH_EPS) {
      return { kind: 'edge', index: i, t: segmentParam(pt, a, b) }
    }
  }
  for (let w = 0; w < walls.length; w++) {
    if (w === self) continue
    if (distanceToSegment(pt, walls[w].a, walls[w].b) <= ATTACH_EPS) {
      return { kind: 'wallBody', wall: w, s: segmentParam(pt, walls[w].a, walls[w].b) }
    }
  }
  return { kind: 'free' }
}

interface WallPos {
  a: Point
  b: Point
}

function squareWalls(
  oldPoints: Point[],
  newPoints: Point[],
  walls: InteriorWall[],
  refDeg: number,
  tolDeg: number,
): { ok: true; positions: WallPos[]; skipped: number } | { ok: false; reason: string } {
  const n = oldPoints.length
  const count = walls.length
  const attach = walls.map((w, i) => ({
    a: classifyEndpoint(w.a, i, oldPoints, walls),
    b: classifyEndpoint(w.b, i, oldPoints, walls),
  }))

  // Which walls are near-orthogonal to the room's axes, and their axis.
  const snap = walls.map((w) => {
    const v = sub(w.b, w.a)
    const length = len(v)
    if (length < MIN_SNAP_EDGE) return null
    const { k, dev } = nearestAxis(angleOf(v), refDeg)
    return dev <= tolDeg + ANGLE_EPS ? { u: axisDir(refDeg, k) } : null
  })

  const cur: WallPos[] = walls.map((w) => ({ a: w.a, b: w.b }))
  const skippedSet = new Set<number>()

  const anchorOf = (att: Attach): Point | null => {
    switch (att.kind) {
      case 'vertex':
        return newPoints[att.index]
      case 'wallEnd':
        return cur[att.wall][att.end]
      case 'edge':
        return lerp(newPoints[att.index], newPoints[(att.index + 1) % n], att.t)
      case 'wallBody':
        return lerp(cur[att.wall].a, cur[att.wall].b, att.s)
      default:
        return null
    }
  }

  const carrierOf = (att: Attach): Line | null => {
    let a: Point
    let b: Point
    if (att.kind === 'edge') {
      a = newPoints[att.index]
      b = newPoints[(att.index + 1) % n]
    } else if (att.kind === 'wallBody') {
      a = cur[att.wall].a
      b = cur[att.wall].b
    } else {
      return null
    }
    const l = len(sub(b, a))
    return l < 1e-12 ? null : { p: a, d: scale(sub(b, a), 1 / l) }
  }

  const isHard = (att: Attach) => att.kind === 'vertex' || att.kind === 'wallEnd'

  /** Attachments only: every endpoint goes to its mapped anchor, free ones
   * stay where they were. Used for walls that aren't squared, and as the
   * fallback when squaring a wall would break an attachment. */
  const mapped = (w: number): WallPos => ({
    a: anchorOf(attach[w].a) ?? walls[w].a,
    b: anchorOf(attach[w].b) ?? walls[w].b,
  })

  const solve = (w: number): WallPos => {
    const sn = snap[w]
    if (!sn) return mapped(w)
    const u = sn.u
    const nrm: Point = { x: -u.y, y: u.x }
    const att = attach[w]
    const anchors = [anchorOf(att.a), anchorOf(att.b)]
    const hard = [isHard(att.a) ? anchors[0] : null, isHard(att.b) ? anchors[1] : null]

    // Where the wall's line sits across its axis (its offset along `nrm`).
    let c: number
    const hardOffsets = hard.filter((p): p is Point => p !== null).map((p) => dot(nrm, p))
    if (hardOffsets.length === 2 && Math.abs(hardOffsets[0] - hardOffsets[1]) > 1e-6) {
      // Pinned at two points that can't both lie on one axis-aligned line
      // (e.g. corner to corner along an edge that was not squared).
      skippedSet.add(w)
      return mapped(w)
    }
    if (hardOffsets.length > 0) {
      c = hardOffsets[0]
    } else {
      const soft = anchors.filter((p): p is Point => p !== null)
      c =
        soft.length > 0
          ? soft.reduce((sum, p) => sum + dot(nrm, p), 0) / soft.length
          : dot(nrm, lerp(walls[w].a, walls[w].b, 0.5))
    }
    const wallLine: Line = { p: scale(nrm, c), d: u }

    const place = (att: Attach, anchor: Point | null): Point | null => {
      if (anchor === null) return null
      if (isHard(att)) return anchor
      const carrier = carrierOf(att)
      if (carrier && Math.abs(cross(u, carrier.d)) > CROSSING_SIN) {
        return intersect(wallLine, carrier)
      }
      return projectOntoLine(anchor, wallLine)
    }
    let a = place(att.a, anchors[0])
    let b = place(att.b, anchors[1])
    const length = len(sub(walls[w].b, walls[w].a))
    if (a === null && b === null) {
      const mid = projectOntoLine(lerp(walls[w].a, walls[w].b, 0.5), wallLine)
      a = sub(mid, scale(u, length / 2))
      b = add(mid, scale(u, length / 2))
    } else if (a === null) {
      a = sub(b as Point, scale(u, length))
    } else if (b === null) {
      b = add(a, scale(u, length))
    }
    const along = dot(sub(b as Point, a), u)
    if (!(along > 0) || along / length < 0.5 || along / length > 2) {
      skippedSet.add(w)
      return mapped(w)
    }
    return { a, b: b as Point }
  }

  // Gauss-Seidel over the walls: a wall hanging off another wall's body needs
  // that wall's new position first, and the dependency order isn't known up
  // front. Chains are shallow in practice; the cap guards cycles.
  for (let pass = 0; pass < count + 2; pass++) {
    let moved = false
    for (let w = 0; w < count; w++) {
      const next = solve(w)
      if (!samePoint(next.a, cur[w].a) || !samePoint(next.b, cur[w].b)) moved = true
      cur[w] = next
    }
    if (!moved) break
  }

  // Safety net: every endpoint that was attached must still be. This also
  // catches non-convergence from a dependency cycle.
  const scaleRef = Math.max(
    1,
    ...newPoints.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))),
  )
  const tol = 1e-6 * scaleRef
  for (let w = 0; w < count; w++) {
    for (const end of ['a', 'b'] as const) {
      const att = attach[w][end]
      const pt = cur[w][end]
      let off = 0
      switch (att.kind) {
        case 'vertex':
          off = len(sub(pt, newPoints[att.index]))
          break
        case 'wallEnd':
          off = len(sub(pt, cur[att.wall][att.end]))
          break
        case 'edge':
          off = distanceToSegment(pt, newPoints[att.index], newPoints[(att.index + 1) % n])
          break
        case 'wallBody':
          off = distanceToSegment(pt, cur[att.wall].a, cur[att.wall].b)
          break
        default:
          break
      }
      if (!(off <= tol) || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
        return { ok: false, reason: 'Interior walls could not be kept attached to the squared room.' }
      }
    }
  }

  return { ok: true, positions: cur, skipped: skippedSet.size }
}

// --- Entry point -----------------------------------------------------------

/** Squares up one room. `walls` are that room's interior walls only (the caller
 * filters by `roomId`). `tolDeg` is the setting from ProjectSettings; values
 * <= 0 square nothing. */
export function squareRoom(
  points: Point[],
  walls: InteriorWall[],
  tolDeg: number,
): SquareRoomResult {
  if (points.length < 3) {
    return { ok: false, reason: 'A room needs at least three corners.' }
  }
  if (!allFinite(points)) {
    return { ok: false, reason: 'The room has invalid coordinates.' }
  }
  const unchanged: SquareRoomResult = { ok: true, changed: false, points, walls, skippedWalls: 0 }
  if (!(tolDeg > 0)) return unchanged
  const tol = Math.min(tolDeg, MAX_SQUARE_CORNERS_TOLERANCE_DEG)

  const perimeter = squarePerimeter(points, tol)
  if (!perimeter.ok) return perimeter

  // Even with no perimeter edge to snap, interior walls near the room's axes
  // could be - but "the room's axes" only means something once at least one
  // perimeter edge defines them.
  if (!perimeter.anySnapped) return unchanged

  const problem = validatePerimeter(points, perimeter.points)
  if (problem) return { ok: false, reason: problem }

  const wallResult = squareWalls(points, perimeter.points, walls, perimeter.refDeg, tol)
  if (!wallResult.ok) return wallResult

  const pointsMoved = perimeter.points.some((p, i) => !samePoint(p, points[i]))
  const newWalls = walls.map((w, i) => {
    const pos = wallResult.positions[i]
    return samePoint(pos.a, w.a) && samePoint(pos.b, w.b) ? w : { ...w, a: pos.a, b: pos.b }
  })
  const wallsMoved = newWalls.some((w, i) => w !== walls[i])
  if (!pointsMoved && !wallsMoved) return unchanged

  return {
    ok: true,
    changed: true,
    points: pointsMoved ? perimeter.points : points,
    walls: newWalls,
    skippedWalls: wallResult.skipped,
  }
}
