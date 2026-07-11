import { Text } from 'react-konva'
import { distance, angle } from '../utils/geometry'
import { formatLength } from '../utils/units'
import type { UnitSystem } from '../utils/units'
import type { Point } from '../types/project'
import { wallLabelOffsetY } from '../utils/wallLabelOffset'

// E4: shared wall-length label used both for committed rooms (RoomLayer)
// and for the in-progress room outline (SelectionLayer). Centered on the
// wall segment, rotated to match its angle, and offset perpendicular to the
// wall - outward from `interiorRef` (e.g. the room's centroid) when one is
// available, scaled by the wall thickness plus a fixed margin so the label
// clears the rendered stroke instead of sitting on top of it.
export function WallLengthLabel({
  a,
  b,
  ppu,
  units,
  wallThicknessWorld,
  interiorRef,
  fill,
  keyId,
}: {
  a: Point
  b: Point
  ppu: number
  units: UnitSystem
  wallThicknessWorld: number
  interiorRef?: Point
  fill: string
  keyId: string
}) {
  const lenWorld = distance(a, b)
  if (lenWorld <= 0) return null
  const angleDeg = angle(a, b)
  const offsetY = wallLabelOffsetY(a, b, angleDeg, wallThicknessWorld, ppu, interiorRef)
  return (
    <Text
      key={keyId}
      x={a.x * ppu}
      y={a.y * ppu}
      rotation={angleDeg}
      width={lenWorld * ppu}
      align="center"
      text={formatLength(lenWorld, units)}
      fontSize={15}
      fill={fill}
      offsetY={offsetY}
      listening={false}
    />
  )
}
