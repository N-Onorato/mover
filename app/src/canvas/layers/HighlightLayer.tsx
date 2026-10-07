import { useMemo } from 'react'
import { Circle, Layer, Line, Text } from 'react-konva'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import {
  computeSelectionBox,
  VERTEX_HIT_THRESHOLD_PX,
  FURNITURE_HANDLE_HIT_THRESHOLD_PX,
  furnitureCorners,
  furnitureRotateHandle,
  imageCorners,
} from '../tools/SelectTool'
import { rotatePoints, selectionRotateHandle, type Rect } from '../tools/multiRotate'
import { rectPoints, rotatePoint } from '../../utils/geometry'
import { wallThresholdWorld } from '../../utils/wallThreshold'
import { activeFurnitureInstances } from '../../project/layouts'
import { useSelectedEntity } from '../../hooks/useSelectedEntity'
import { withFurnitureDragPreview, withImageDragPreview, wallEndpointsWithDragPreview } from './dragPreview'
import type { Point } from '../../types/project'

interface Props {
  pixelsPerUnit: number
}

// G6: mirrors SelectTool.ts's hit-test corridor so the drawn marker matches
// the actual grabbable area.
function vertexRadiusPx(wallThicknessWorld: number, ppu: number): number {
  return wallThresholdWorld(VERTEX_HIT_THRESHOLD_PX, wallThicknessWorld, ppu) * ppu
}

const FURNITURE_HANDLE_RADIUS_PX = FURNITURE_HANDLE_HIT_THRESHOLD_PX - 3

/** The "this is selected" dashed outline, identical for every entity type
 * (room polygon, furniture box, reference image box, interior-wall segment) so
 * the types can't visually drift apart. Open segments are drawn thicker to
 * stay visible without an enclosed area to read. */
function SelectionOutline({ points, closed = true }: { points: number[]; closed?: boolean }) {
  return (
    <Line
      points={points}
      closed={closed}
      stroke="#ffb400"
      strokeWidth={closed ? 2 : 4}
      dash={[8, 4]}
      listening={false}
    />
  )
}

/** O7 (#47): the multi-selection bounding box with its rotate handle and
 * stalk, mirroring the single-furniture rotate handle's look. `rect` is the
 * box at rest; a live move adds `offset`, a live rotate turns the whole box
 * (and handle) about `rotation.pivot`, with the current angle read out next
 * to the handle. */
function MultiSelectionBox({
  rect,
  ppu,
  offset,
  rotation,
}: {
  rect: Rect
  ppu: number
  offset: Point | null
  rotation: { pivot: Point; delta: number } | null
}) {
  const place = (p: Point): Point => {
    const r = rotation ? rotatePoint(p, rotation.pivot, rotation.delta) : p
    return offset ? { x: r.x + offset.x, y: r.y + offset.y } : r
  }
  const corners = rectPoints(rect.x, rect.y, rect.width, rect.height).map(place)
  const handle = place(selectionRotateHandle(rect, ppu))
  const topMid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 }

  return (
    <>
      <Line
        points={corners.flatMap((p) => [p.x * ppu, p.y * ppu])}
        closed
        stroke="#4a9eff"
        strokeWidth={1.5}
        listening={false}
      />
      <Line
        points={[topMid.x * ppu, topMid.y * ppu, handle.x * ppu, handle.y * ppu]}
        stroke="#4caf50"
        strokeWidth={1}
        listening={false}
      />
      <Circle
        x={handle.x * ppu}
        y={handle.y * ppu}
        radius={FURNITURE_HANDLE_RADIUS_PX}
        fill="#4caf50"
        opacity={0.9}
        listening={false}
      />
      {rotation && (
        <Text
          x={handle.x * ppu + FURNITURE_HANDLE_RADIUS_PX + 6}
          y={handle.y * ppu - 6}
          text={`${Number(rotation.delta.toFixed(1))}°`}
          fill="#4caf50"
          fontSize={12}
          fontStyle="bold"
          listening={false}
        />
      )}
    </>
  )
}

export function HighlightLayer({ pixelsPerUnit: ppu }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const selectedWall = useUIStore((s) => s.selectedWall)
  const rooms = useProjectStore((s) => s.project.rooms)
  const interiorWalls = useProjectStore((s) => s.project.interiorWalls)
  const furnitureInstances = useProjectStore((s) => activeFurnitureInstances(s.project))
  const referenceImages = useProjectStore((s) => s.project.referenceImages)
  const dragState = useUIStore((s) => s.dragState)
  const project = useProjectStore((s) => s.project)

  // O7 (#47): the multi-selection bounding box. Computed from the committed
  // project, which no preview drag mutates, so it stays put (and isn't
  // recomputed) while the live move/rotate transform is applied on top of it.
  const selectionBox = useMemo(
    () => computeSelectionBox(selectedIds, project, ppu),
    [selectedIds, project, ppu],
  )

  const selected = useSelectedEntity()
  const selectedRoom = selected?.type === 'room' ? selected.room : undefined
  const selectedWallEntity = selected?.type === 'interiorWall' ? selected.wall : undefined
  // Live drag preview, so handles and outlines track the entity mid-drag.
  const selectedFurniture =
    selected?.type === 'furniture' ? withFurnitureDragPreview(selected.furniture, dragState) : undefined
  const selectedImage =
    selected?.type === 'referenceImage' ? withImageDragPreview(selected.image, dragState) : undefined

  // Multi-select: no per-entity resize/rotate/vertex handles (those only make
  // sense for a single entity), just a plain outline per selected item so a
  // marquee or shift-click selection is visually confirmed - plus, when the
  // selection has a bounding box (O7, #47), the box with its rotate handle.
  if (selectedIds.length > 1) {
    const idSet = new Set(selectedIds)
    const multiDrag = dragState?.kind === 'multi' ? dragState : null
    const rotateDrag = dragState?.kind === 'multiRotate' ? dragState : null
    const outlines: { points: number[]; closed: boolean }[] = []
    for (const r of rooms) {
      if (idSet.has(r.id)) {
        const points =
          multiDrag && multiDrag.roomIds.includes(r.id)
            ? r.points.map((p) => ({ x: p.x + multiDrag.dx, y: p.y + multiDrag.dy }))
            : rotateDrag && rotateDrag.roomIds.includes(r.id)
              ? rotatePoints(r.points, rotateDrag.pivot, rotateDrag.delta)
              : r.points
        outlines.push({ points: points.flatMap((p) => [p.x * ppu, p.y * ppu]), closed: true })
      }
    }
    for (const f of furnitureInstances) {
      if (idSet.has(f.id) && f.visible && !f.locked) {
        const live = withFurnitureDragPreview(f, dragState)
        outlines.push({ points: furnitureCorners(live).flatMap((p) => [p.x * ppu, p.y * ppu]), closed: true })
      }
    }
    for (const w of interiorWalls) {
      if (idSet.has(w.id)) {
        const seg = wallEndpointsWithDragPreview(w, dragState)
        outlines.push({ points: [seg.a.x * ppu, seg.a.y * ppu, seg.b.x * ppu, seg.b.y * ppu], closed: false })
      }
    }
    for (const img of referenceImages) {
      if (idSet.has(img.id) && img.visible && !img.locked) {
        const live = withImageDragPreview(img, dragState)
        outlines.push({ points: imageCorners(live).flatMap((p) => [p.x * ppu, p.y * ppu]), closed: true })
      }
    }

    return (
      <Layer listening={false}>
        {outlines.map((o, i) => (
          <SelectionOutline key={i} points={o.points} closed={o.closed} />
        ))}
        {selectionBox && (
          <MultiSelectionBox
            rect={selectionBox.rect}
            ppu={ppu}
            offset={multiDrag ? { x: multiDrag.dx, y: multiDrag.dy } : null}
            rotation={rotateDrag ? { pivot: rotateDrag.pivot, delta: rotateDrag.delta } : null}
          />
        )}
      </Layer>
    )
  }

  if (!selected) return <Layer listening={false} />

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

  // L3: a solo-selected reference image gets the same dashed outline every
  // other entity type gets. Outline only - resizing and rotating an image is a
  // PropertiesPanel concern, so there are no on-canvas handles to draw.
  let imageOutline: number[] | null = null
  if (selectedImage && selectedImage.visible && !selectedImage.locked) {
    imageOutline = imageCorners(selectedImage).flatMap((p) => [p.x * ppu, p.y * ppu])
  }

  return (
    <Layer listening={false}>
      {flatPoints && <SelectionOutline points={flatPoints} />}
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
      {imageOutline && <SelectionOutline points={imageOutline} />}
      {furnitureOutline && <SelectionOutline points={furnitureOutline} />}
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
