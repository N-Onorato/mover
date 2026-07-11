import { Circle, Layer, Line } from 'react-konva'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'

interface Props {
  pixelsPerUnit: number
}

// G6: mirrors SelectTool.ts's VERTEX_HIT_THRESHOLD_PX / wallThresholdWorld so
// the drawn marker matches the actual grabbable hit-test corridor (kept
// in sync manually since SelectTool.ts doesn't export these - it's owned by
// another track in this pass).
const VERTEX_HIT_THRESHOLD_PX = 9

function vertexRadiusPx(wallThicknessWorld: number, ppu: number): number {
  return Math.max(VERTEX_HIT_THRESHOLD_PX, (wallThicknessWorld * ppu) / 2)
}

export function HighlightLayer({ pixelsPerUnit: ppu }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const selectedWall = useUIStore((s) => s.selectedWall)
  const rooms = useProjectStore((s) => s.project.rooms)

  const selectedRoom =
    selectedIds.length === 1 ? rooms.find((r) => r.id === selectedIds[0]) : undefined

  if (!selectedRoom) return <Layer listening={false} />

  const flatPoints = selectedRoom.points.flatMap((p) => [p.x * ppu, p.y * ppu])

  let wallSegment: number[] | null = null
  if (selectedWall && selectedWall.roomId === selectedRoom.id) {
    const a = selectedRoom.points[selectedWall.edgeIndex]
    const b = selectedRoom.points[(selectedWall.edgeIndex + 1) % selectedRoom.points.length]
    wallSegment = [a.x * ppu, a.y * ppu, b.x * ppu, b.y * ppu]
  }

  // G6: vertex markers for the selected room only (nothing rendered vertices
  // after a room was committed, making them hard to find/grab). Locked rooms
  // aren't draggable (see SelectTool.ts's `room.locked` checks), so their
  // vertices aren't grabbable either - skip drawing markers for them rather
  // than showing handles that don't do anything.
  const vertexRadius = vertexRadiusPx(selectedRoom.wallThickness, ppu)

  return (
    <Layer listening={false}>
      <Line
        points={flatPoints}
        closed
        stroke="#ffb400"
        strokeWidth={2}
        dash={[8, 4]}
        listening={false}
      />
      {wallSegment && (
        <Line points={wallSegment} stroke="#ff5a36" strokeWidth={4} listening={false} />
      )}
      {!selectedRoom.locked &&
        selectedRoom.points.map((p, i) => (
          <Circle
            key={i}
            x={p.x * ppu}
            y={p.y * ppu}
            radius={vertexRadius}
            fill="#4a9eff"
            opacity={0.85}
            listening={false}
          />
        ))}
    </Layer>
  )
}
