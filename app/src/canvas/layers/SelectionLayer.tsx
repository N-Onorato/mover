import { Layer, Line, Circle, Text } from 'react-konva'
import { useUIStore } from '../../store/uiStore'
import { distance } from '../../utils/geometry'
import { formatLength } from '../../utils/units'
import type { UnitSystem } from '../../utils/units'

interface Props {
  pixelsPerUnit: number
  units: UnitSystem
}

const CLOSE_THRESHOLD_PX = 14

function CalibrationPreview({ pixelsPerUnit, units }: Props) {
  const drawingState = useUIStore((s) => s.drawingState)
  if (!drawingState || drawingState.kind !== 'calibration') return null
  const { points, cursor } = drawingState
  const ppu = pixelsPerUnit

  const first = points[0]
  const end = points[0] ? cursor : null
  if (!first || !end) return null

  const worldDist = distance(first, end)

  return (
    <Layer listening={false}>
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
    </Layer>
  )
}

export function SelectionLayer({ pixelsPerUnit, units }: Props) {
  const drawingState = useUIStore((s) => s.drawingState)

  if (drawingState?.kind === 'calibration') {
    return <CalibrationPreview pixelsPerUnit={pixelsPerUnit} units={units} />
  }

  if (!drawingState || drawingState.kind !== 'room') return <Layer />

  const { points, cursor } = drawingState
  const ppu = pixelsPerUnit

  // Convert world points to flat pixel array for Konva
  const flatCommitted = points.flatMap((p) => [p.x * ppu, p.y * ppu])

  const cursorPx = cursor ? { x: cursor.x * ppu, y: cursor.y * ppu } : null
  const firstPx = points.length > 0 ? { x: points[0].x * ppu, y: points[0].y * ppu } : null

  const nearClose =
    cursorPx &&
    firstPx &&
    points.length >= 3 &&
    distance(cursorPx, firstPx) <= CLOSE_THRESHOLD_PX

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
    </Layer>
  )
}
