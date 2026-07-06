import type { ReactElement } from 'react'
import { Layer, Line, Circle } from 'react-konva'
import { adaptiveGridSize } from '../../utils/snap'

const ORIGIN_MARKER_RADIUS = 5
const ORIGIN_AXIS_LENGTH = 16

interface Props {
  pixelsPerUnit: number
  gridSize: number        // base grid size in world units
  viewX: number           // stage pan offset x (pixels)
  viewY: number           // stage pan offset y (pixels)
  zoom: number
  width: number
  height: number
}

export function GridLayer({ pixelsPerUnit, gridSize, viewX, viewY, zoom, width, height }: Props) {
  const spacing = adaptiveGridSize(gridSize, zoom)
  const spacingPx = spacing * pixelsPerUnit

  const originMarker = (
    <>
      <Line points={[-ORIGIN_AXIS_LENGTH, 0, ORIGIN_AXIS_LENGTH, 0]} stroke="#e8543a" strokeWidth={2} listening={false} />
      <Line points={[0, -ORIGIN_AXIS_LENGTH, 0, ORIGIN_AXIS_LENGTH]} stroke="#e8543a" strokeWidth={2} listening={false} />
      <Circle x={0} y={0} radius={ORIGIN_MARKER_RADIUS} fill="#e8543a" listening={false} />
    </>
  )

  if (spacingPx < 4) return <Layer listening={false}>{originMarker}</Layer>

  // Visible world bounds (in stage-local pixel coords, before pan)
  const left = -viewX
  const top = -viewY
  const right = left + width
  const bottom = top + height

  const startX = Math.floor(left / spacingPx) * spacingPx
  const startY = Math.floor(top / spacingPx) * spacingPx

  const vLines: ReactElement[] = []
  const hLines: ReactElement[] = []

  for (let x = startX; x <= right; x += spacingPx) {
    vLines.push(
      <Line key={`v${x}`} points={[x, top, x, bottom]} stroke="#2a2a2a" strokeWidth={1} listening={false} />,
    )
  }
  for (let y = startY; y <= bottom; y += spacingPx) {
    hLines.push(
      <Line key={`h${y}`} points={[left, y, right, y]} stroke="#2a2a2a" strokeWidth={1} listening={false} />,
    )
  }

  return (
    <Layer listening={false}>
      {vLines}
      {hLines}
      {originMarker}
    </Layer>
  )
}
