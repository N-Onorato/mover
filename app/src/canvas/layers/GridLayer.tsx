import { useMemo } from 'react'
import { Layer, Line, Circle } from 'react-konva'
import { gridSpacingPx, gridTickPositions, imperialFootInchTicks, isFootInchRuler } from '../../utils/gridRuler'
import type { UnitSystem } from '../../utils/units'
import type { ProjectSettings } from '../../types/project'

const ORIGIN_MARKER_RADIUS = 5
const ORIGIN_AXIS_LENGTH = 16

function OriginMarker() {
  return (
    <>
      <Line points={[-ORIGIN_AXIS_LENGTH, 0, ORIGIN_AXIS_LENGTH, 0]} stroke="#e8543a" strokeWidth={2} listening={false} />
      <Line points={[0, -ORIGIN_AXIS_LENGTH, 0, ORIGIN_AXIS_LENGTH]} stroke="#e8543a" strokeWidth={2} listening={false} />
      <Circle x={0} y={0} radius={ORIGIN_MARKER_RADIUS} fill="#e8543a" listening={false} />
    </>
  )
}

interface Props {
  pixelsPerUnit: number
  gridSize: number        // base grid size in world units
  viewX: number           // stage pan offset x (pixels)
  viewY: number           // stage pan offset y (pixels)
  zoom: number
  width: number
  height: number
  units: UnitSystem
  rulerMode: ProjectSettings['rulerMode']
}

const FOOT_LINE_COLOR = '#2a2a2a'
const INCH_LINE_COLOR = '#33405a'

export function GridLayer({ pixelsPerUnit, gridSize, viewX, viewY, zoom, width, height, units, rulerMode }: Props) {
  const useFootInches = isFootInchRuler(units, rulerMode)
  const spacingPx = gridSpacingPx(gridSize, zoom, pixelsPerUnit)

  // Visible world bounds (in stage-local pixel coords, before pan)
  const left = -viewX
  const top = -viewY
  const right = left + width
  const bottom = top + height

  const { vLines, hLines } = useMemo(() => {
    if (useFootInches) {
      const vLines = imperialFootInchTicks(left, right, pixelsPerUnit, zoom).map(({ pos: x, kind }) => (
        <Line
          key={`v${x}`}
          points={[x, top, x, bottom]}
          stroke={kind === 'foot' ? FOOT_LINE_COLOR : INCH_LINE_COLOR}
          strokeWidth={1}
          listening={false}
        />
      ))
      const hLines = imperialFootInchTicks(top, bottom, pixelsPerUnit, zoom).map(({ pos: y, kind }) => (
        <Line
          key={`h${y}`}
          points={[left, y, right, y]}
          stroke={kind === 'foot' ? FOOT_LINE_COLOR : INCH_LINE_COLOR}
          strokeWidth={1}
          listening={false}
        />
      ))
      return { vLines, hLines }
    }
    const vLines = gridTickPositions(left, right, spacingPx).map((x) => (
      <Line key={`v${x}`} points={[x, top, x, bottom]} stroke="#2a2a2a" strokeWidth={1} listening={false} />
    ))
    const hLines = gridTickPositions(top, bottom, spacingPx).map((y) => (
      <Line key={`h${y}`} points={[left, y, right, y]} stroke="#2a2a2a" strokeWidth={1} listening={false} />
    ))
    return { vLines, hLines }
  }, [left, top, right, bottom, spacingPx, useFootInches, pixelsPerUnit, zoom])

  return (
    <Layer listening={false}>
      {vLines}
      {hLines}
      <OriginMarker />
    </Layer>
  )
}
