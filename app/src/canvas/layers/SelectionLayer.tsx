import { Layer, Line, Circle, Text, Rect } from 'react-konva'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { distance } from '../../utils/geometry'
import { formatLength } from '../../utils/units'
import type { UnitSystem } from '../../utils/units'
import type { Point } from '../../types/project'
import { WallLengthLabel } from '../WallLengthLabel'

interface Props {
  pixelsPerUnit: number
  units: UnitSystem
}

const CLOSE_THRESHOLD_PX = 14

function CalibrationPreviewContents({ pixelsPerUnit, units }: Props) {
  const drawingState = useUIStore((s) => s.drawingState)
  if (!drawingState || drawingState.kind !== 'calibration') return null
  const { points, cursor } = drawingState
  const ppu = pixelsPerUnit

  const first = points[0]
  const end = points[0] ? cursor : null
  if (!first || !end) return null

  const worldDist = distance(first, end)

  return (
    <>
      <Line
        points={[first.x * ppu, first.y * ppu, end.x * ppu, end.y * ppu]}
        stroke="#ffb400"
        strokeWidth={2.5}
        dash={[8, 5]}
        listening={false}
      />
      <Circle x={first.x * ppu} y={first.y * ppu} radius={4} fill="#ffb400" listening={false} />
      <Circle x={end.x * ppu} y={end.y * ppu} radius={4} fill="#ffb400" listening={false} />
      <Text
        x={(first.x * ppu + end.x * ppu) / 2 + 6}
        y={(first.y * ppu + end.y * ppu) / 2 - 16}
        text={formatLength(worldDist, units)}
        fill="#ffb400"
        fontSize={12}
        listening={false}
      />
    </>
  )
}

export function SelectionLayer({ pixelsPerUnit, units }: Props) {
  const drawingState = useUIStore((s) => s.drawingState)
  const marquee = useUIStore((s) => s.marquee)
  const showWallLabels = useUIStore((s) => s.showWallLabels)
  const defaultWallThickness = useProjectStore((s) => s.project.settings.defaultWallThickness)
  const ppu = pixelsPerUnit

  // Marquee (C1): live drag rectangle rendered on top of everything else.
  const marqueeRect = marquee ? (
    <Rect
      x={Math.min(marquee.start.x, marquee.end.x) * ppu}
      y={Math.min(marquee.start.y, marquee.end.y) * ppu}
      width={Math.abs(marquee.end.x - marquee.start.x) * ppu}
      height={Math.abs(marquee.end.y - marquee.start.y) * ppu}
      fill="rgba(74,158,255,0.12)"
      stroke="#4a9eff"
      strokeWidth={1}
      dash={[4, 4]}
      listening={false}
    />
  ) : null

  if (drawingState?.kind === 'calibration') {
    return (
      <Layer listening={false}>
        <CalibrationPreviewContents pixelsPerUnit={pixelsPerUnit} units={units} />
        {marqueeRect}
      </Layer>
    )
  }

  if (!drawingState || drawingState.kind !== 'room') {
    return <Layer listening={false}>{marqueeRect}</Layer>
  }

  const { points, cursor } = drawingState

  // Convert world points to flat pixel array for Konva
  const flatCommitted = points.flatMap((p) => [p.x * ppu, p.y * ppu])

  const cursorPx = cursor ? { x: cursor.x * ppu, y: cursor.y * ppu } : null
  const firstPx = points.length > 0 ? { x: points[0].x * ppu, y: points[0].y * ppu } : null

  const nearClose =
    cursorPx &&
    firstPx &&
    points.length >= 3 &&
    distance(cursorPx, firstPx) <= CLOSE_THRESHOLD_PX

  // D1/E4: wall length labels while drawing a room in progress - one per
  // committed segment, plus the live ghost segment to the cursor. The room
  // isn't closed yet so there's no well-defined interior; once at least 3
  // points are committed we approximate one as their centroid (including the
  // live cursor point, so the ghost segment's label also points outward as
  // the shape takes form), otherwise WallLengthLabel falls back to a fixed
  // perpendicular direction.
  const interiorRef: Point | undefined =
    points.length >= 3
      ? (() => {
          const pts = cursor ? [...points, cursor] : points
          const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
          return { x: sum.x / pts.length, y: sum.y / pts.length }
        })()
      : undefined

  const wallLabels: React.ReactNode[] = []
  if (showWallLabels) {
    for (let i = 0; i < points.length - 1; i++) {
      wallLabels.push(
        <WallLengthLabel
          key={`seg-${i}`}
          a={points[i]}
          b={points[i + 1]}
          ppu={ppu}
          units={units}
          wallThicknessWorld={defaultWallThickness}
          interiorRef={interiorRef}
          fill="#4a9eff"
        />,
      )
    }
    if (cursor && points.length >= 1 && !nearClose) {
      wallLabels.push(
        <WallLengthLabel
          key="ghost"
          a={points[points.length - 1]}
          b={cursor}
          ppu={ppu}
          units={units}
          wallThicknessWorld={defaultWallThickness}
          interiorRef={interiorRef}
          fill="#4a9eff"
        />,
      )
    }
  }

  return (
    <Layer listening={false}>
      {/* Committed polygon outline so far */}
      {points.length >= 2 && (
        <Line
          points={flatCommitted}
          stroke="#4a9eff"
          strokeWidth={3}
          dash={[]}
          listening={false}
        />
      )}

      {/* Ghost line from last point to cursor */}
      {cursorPx && points.length >= 1 && (
        <Line
          points={[
            points[points.length - 1].x * ppu,
            points[points.length - 1].y * ppu,
            cursorPx.x,
            cursorPx.y,
          ]}
          stroke="#4a9eff"
          strokeWidth={2.5}
          dash={[8, 5]}
          opacity={0.9}
          listening={false}
        />
      )}

      {/* Closing line from cursor back to first point (when closeable) */}
      {cursorPx && firstPx && points.length >= 3 && !nearClose && (
        <Line
          points={[cursorPx.x, cursorPx.y, firstPx.x, firstPx.y]}
          stroke="#4a9eff"
          strokeWidth={2}
          dash={[5, 7]}
          opacity={0.5}
          listening={false}
        />
      )}

      {/* First-point snap target circle */}
      {firstPx && (
        <Circle
          x={firstPx.x}
          y={firstPx.y}
          radius={nearClose ? 8 : 4}
          fill={nearClose ? '#4a9eff' : 'transparent'}
          stroke="#4a9eff"
          strokeWidth={nearClose ? 2 : 1.5}
          listening={false}
        />
      )}

      {/* Vertex dots for committed points */}
      {points.map((p, i) => (
        <Circle
          key={i}
          x={p.x * ppu}
          y={p.y * ppu}
          radius={3}
          fill="#4a9eff"
          listening={false}
        />
      ))}

      {/* Cursor dot */}
      {cursorPx && (
        <Circle
          x={cursorPx.x}
          y={cursorPx.y}
          radius={3}
          fill={nearClose ? '#4a9eff' : '#fff'}
          stroke="#4a9eff"
          strokeWidth={1.5}
          listening={false}
        />
      )}

      {wallLabels}
      {marqueeRect}
    </Layer>
  )
}
