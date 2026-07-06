import { Fragment } from 'react'
import { Layer, Line, Text } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'
import { polygonBoundingBox } from '../../utils/geometry'

interface Props {
  pixelsPerUnit: number
}

export function RoomLayer({ pixelsPerUnit }: Props) {
  const rooms = useProjectStore((s) => s.project.rooms)

  return (
    <Layer>
      {rooms.filter((r) => r.visible).map((room) => {
        const flatPoints = room.points.flatMap((p) => [p.x * pixelsPerUnit, p.y * pixelsPerUnit])
        const bb = polygonBoundingBox(room.points)
        const cx = (bb.x + bb.width / 2) * pixelsPerUnit
        const cy = (bb.y + bb.height / 2) * pixelsPerUnit
        return (
          <Fragment key={room.id}>
            <Line
              points={flatPoints}
              closed
              fill={room.fillColor === 'transparent' ? undefined : room.fillColor}
              stroke={room.wallColor}
              strokeWidth={room.wallThickness * pixelsPerUnit}
            />
            {room.name && (
              <Text x={cx} y={cy} text={room.name} align="center" offsetX={40} offsetY={8} fill="#ddd" fontSize={13} />
            )}
          </Fragment>
        )
      })}
    </Layer>
  )
}
