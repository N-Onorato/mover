import { Circle, Layer, Line } from 'react-konva'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import {
  VERTEX_HIT_THRESHOLD_PX,
  FURNITURE_HANDLE_HIT_THRESHOLD_PX,
  furnitureCorners,
  furnitureRotateHandle,
  imageCorners,
} from '../tools/SelectTool'
import { wallThresholdWorld } from '../../utils/wallThreshold'
import type { FurnitureInstance } from '../../types/project'

interface Props {
  pixelsPerUnit: number
}

// G6: mirrors SelectTool.ts's hit-test corridor so the drawn marker matches
// the actual grabbable area.
function vertexRadiusPx(wallThicknessWorld: number, ppu: number): number {
  return wallThresholdWorld(VERTEX_HIT_THRESHOLD_PX, wallThicknessWorld, ppu) * ppu
}

const FURNITURE_HANDLE_RADIUS_PX = FURNITURE_HANDLE_HIT_THRESHOLD_PX - 3

export function HighlightLayer({ pixelsPerUnit: ppu }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const selectedWall = useUIStore((s) => s.selectedWall)
  const rooms = useProjectStore((s) => s.project.rooms)
  const interiorWalls = useProjectStore((s) => s.project.interiorWalls)
  const furnitureInstances = useProjectStore((s) => s.project.furnitureInstances)
  const referenceImages = useProjectStore((s) => s.project.referenceImages)
  const dragState = useUIStore((s) => s.dragState)

  const selectedRoom =
    selectedIds.length === 1 ? rooms.find((r) => r.id === selectedIds[0]) : undefined

  const selectedWallEntity =
    selectedIds.length === 1 ? interiorWalls.find((w) => w.id === selectedIds[0]) : undefined

  const selectedFurnitureBase =
    selectedIds.length === 1 ? furnitureInstances.find((f) => f.id === selectedIds[0]) : undefined

  // Substitute live drag-preview values while a resize/move/rotate is in
  // progress, mirroring the room-drag preview pattern above.
  let selectedFurniture: FurnitureInstance | undefined = selectedFurnitureBase
  const singleFurnitureMultiPos =
    selectedFurnitureBase && dragState?.kind === 'multi'
      ? dragState.currentFurniturePosById[selectedFurnitureBase.id]
      : undefined
  if (selectedFurnitureBase && singleFurnitureMultiPos) {
    selectedFurniture = { ...selectedFurnitureBase, x: singleFurnitureMultiPos.x, y: singleFurnitureMultiPos.y }
  } else if (
    selectedFurnitureBase &&
    dragState?.kind === 'furnitureResize' &&
    dragState.id === selectedFurnitureBase.id
  ) {
    selectedFurniture = {
      ...selectedFurnitureBase,
      x: dragState.currentX,
      y: dragState.currentY,
      width: dragState.currentWidth,
      depth: dragState.currentDepth,
    }
  } else if (
    selectedFurnitureBase &&
    dragState?.kind === 'furnitureRotate' &&
    dragState.id === selectedFurnitureBase.id
  ) {
    selectedFurniture = { ...selectedFurnitureBase, rotation: dragState.currentRotation }
  }

  // Multi-select: no resize/rotate/vertex handles (those only make sense for
  // a single entity), just a plain outline per selected item so a marquee or
  // shift-click selection is visually confirmed.
  if (selectedIds.length > 1) {
    const idSet = new Set(selectedIds)
    const multiDrag = dragState?.kind === 'multi' ? dragState : null
    const outlines: { points: number[]; closed: boolean }[] = []
    for (const r of rooms) {
      if (idSet.has(r.id)) {
        const points = multiDrag?.currentRoomPointsById[r.id] ?? r.points
        outlines.push({ points: points.flatMap((p) => [p.x * ppu, p.y * ppu]), closed: true })
      }
    }
    for (const f of furnitureInstances) {
      if (idSet.has(f.id) && !f.locked) {
        const pos = multiDrag?.currentFurniturePosById[f.id]
        const withPos = pos ? { ...f, x: pos.x, y: pos.y } : f
        outlines.push({ points: furnitureCorners(withPos).flatMap((p) => [p.x * ppu, p.y * ppu]), closed: true })
      }
    }
    for (const w of interiorWalls) {
      if (idSet.has(w.id)) {
        const seg = multiDrag?.currentWallById[w.id] ?? w
        outlines.push({ points: [seg.a.x * ppu, seg.a.y * ppu, seg.b.x * ppu, seg.b.y * ppu], closed: false })
      }
    }
    for (const img of referenceImages) {
      if (idSet.has(img.id)) {
        outlines.push({ points: imageCorners(img).flatMap((p) => [p.x * ppu, p.y * ppu]), closed: true })
      }
    }

    return (
      <Layer listening={false}>
        {outlines.map((o, i) => (
          <Line
            key={i}
            points={o.points}
            closed={o.closed}
            stroke="#ffb400"
            strokeWidth={o.closed ? 2 : 4}
            dash={[8, 4]}
            listening={false}
          />
        ))}
      </Layer>
    )
  }

  if (!selectedRoom && !selectedWallEntity && !selectedFurniture) return <Layer listening={false} />

  let flatPoints: number[] | null = null
  let wallSegment: number[] | null = null
  let vertexMarkers: { x: number; y: number }[] = []

  if (selectedRoom) {
    flatPoints = selectedRoom.points.flatMap((p) => [p.x * ppu, p.y * ppu])

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
    if (!selectedRoom.locked) {
      vertexMarkers = selectedRoom.points.map((p) => ({ x: p.x * ppu, y: p.y * ppu }))
    }
  }

  let interiorWallSegment: number[] | null = null
  if (selectedWallEntity) {
    interiorWallSegment = [
      selectedWallEntity.a.x * ppu,
      selectedWallEntity.a.y * ppu,
      selectedWallEntity.b.x * ppu,
      selectedWallEntity.b.y * ppu,
    ]
    if (!selectedWallEntity.locked) {
      vertexMarkers = [
        { x: selectedWallEntity.a.x * ppu, y: selectedWallEntity.a.y * ppu },
        { x: selectedWallEntity.b.x * ppu, y: selectedWallEntity.b.y * ppu },
      ]
    }
  }

  const vertexRadius = vertexRadiusPx(
    selectedRoom?.wallThickness ?? selectedWallEntity?.thickness ?? 0,
    ppu,
  )

  let furnitureOutline: number[] | null = null
  let furnitureHandles: { x: number; y: number }[] = []
  let rotateHandlePt: { x: number; y: number } | null = null
  let rotateStalk: number[] | null = null

  if (selectedFurniture && !selectedFurniture.locked) {
    const corners = furnitureCorners(selectedFurniture)
    furnitureOutline = corners.flatMap((p) => [p.x * ppu, p.y * ppu])
    furnitureHandles = corners.map((p) => ({ x: p.x * ppu, y: p.y * ppu }))

    const rotateHandle = furnitureRotateHandle(selectedFurniture, ppu)
    rotateHandlePt = { x: rotateHandle.x * ppu, y: rotateHandle.y * ppu }
    // The box's top-mid corner (average of the two top corners, which stay
    // adjacent under rotation) as the stalk's inner endpoint.
    const topMid = {
      x: (corners[0].x + corners[1].x) / 2,
      y: (corners[0].y + corners[1].y) / 2,
    }
    rotateStalk = [topMid.x * ppu, topMid.y * ppu, rotateHandlePt.x, rotateHandlePt.y]
  }

  return (
    <Layer listening={false}>
      {flatPoints && (
        <Line
          points={flatPoints}
          closed
          stroke="#ffb400"
          strokeWidth={2}
          dash={[8, 4]}
          listening={false}
        />
      )}
      {wallSegment && (
        <Line points={wallSegment} stroke="#ff5a36" strokeWidth={4} listening={false} />
      )}
      {interiorWallSegment && (
        <Line points={interiorWallSegment} stroke="#ff5a36" strokeWidth={4} listening={false} />
      )}
      {vertexMarkers.map((p, i) => (
        <Circle
          key={i}
          x={p.x}
          y={p.y}
          radius={vertexRadius}
          fill="#4a9eff"
          opacity={0.85}
          listening={false}
        />
      ))}
      {furnitureOutline && (
        <Line
          points={furnitureOutline}
          closed
          stroke="#ffb400"
          strokeWidth={2}
          dash={[8, 4]}
          listening={false}
        />
      )}
      {furnitureHandles.map((p, i) => (
        <Circle
          key={`furniture-handle-${i}`}
          x={p.x}
          y={p.y}
          radius={FURNITURE_HANDLE_RADIUS_PX}
          fill="#4a9eff"
          opacity={0.85}
          listening={false}
        />
      ))}
      {rotateStalk && <Line points={rotateStalk} stroke="#4caf50" strokeWidth={1} listening={false} />}
      {rotateHandlePt && (
        <Circle
          x={rotateHandlePt.x}
          y={rotateHandlePt.y}
          radius={FURNITURE_HANDLE_RADIUS_PX}
          fill="#4caf50"
          opacity={0.9}
          listening={false}
        />
      )}
    </Layer>
  )
}
