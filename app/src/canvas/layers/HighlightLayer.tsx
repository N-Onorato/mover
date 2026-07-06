import { Layer, Line } from 'react-konva'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'

interface Props {
  pixelsPerUnit: number
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
    </Layer>
  )
}
