import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'
import { distance, polygonBoundingBox } from '../utils/geometry'
import { formatLength, parseLength } from '../utils/units'
import { MIN_FURNITURE_SIZE } from '../furniture/catalog'
import type { Room, InteriorWall, FurnitureInstance } from '../types/project'
import styles from './PropertiesPanel.module.css'

export function useSnapshotOnFocus() {
  const snapshotTaken = useRef(false)
  return {
    onFocus: () => {
      if (snapshotTaken.current) return
      snapshotTaken.current = true
      useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
    },
    onBlur: () => {
      snapshotTaken.current = false
    },
  }
}

interface UndoableFieldProps {
  label: string
  value: string
  type?: 'text' | 'number'
  // Return false to revert the field back to `value` (invalid input).
  onCommit: (raw: string) => boolean
}

export function UndoableField({ label, value, type = 'text', onCommit }: UndoableFieldProps) {
  const [local, setLocal] = useState(value)
  const snapshot = useSnapshotOnFocus()
  useEffect(() => setLocal(value), [value])

  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        className={styles.input}
        type={type}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={snapshot.onFocus}
        onBlur={() => {
          if (!onCommit(local)) setLocal(value)
          snapshot.onBlur()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </label>
  )
}

function WallProperties({ room, edgeIndex }: { room: Room; edgeIndex: number }) {
  const units = useProjectStore((s) => s.project.settings.units)
  const updateRoom = useProjectStore((s) => s.updateRoom)

  const a = room.points[edgeIndex]
  const b = room.points[(edgeIndex + 1) % room.points.length]
  const currentLength = distance(a, b)

  function commitLength(raw: string) {
    const result = parseLength(raw, units)
    if (!result.ok) return false
    const newLength = result.value
    const dx = b.x - a.x
    const dy = b.y - a.y
    if (currentLength === 0) return false
    const dirX = dx / currentLength
    const dirY = dy / currentLength
    const newB = { x: a.x + dirX * newLength, y: a.y + dirY * newLength }
    const newPoints = room.points.map((p, i) => (i === (edgeIndex + 1) % room.points.length ? newB : p))
    updateRoom(room.id, { points: newPoints })
    return true
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Wall</div>
      <UndoableField label="Length" type="number" value={currentLength.toFixed(1)} onCommit={commitLength} />
      <div className={styles.hint}>{formatLength(currentLength, units)}</div>
    </div>
  )
}

function RoomProperties({ room }: { room: Room }) {
  const units = useProjectStore((s) => s.project.settings.units)
  const updateRoom = useProjectStore((s) => s.updateRoom)
  const bb = polygonBoundingBox(room.points)

  function commitName(raw: string) {
    if (raw !== room.name) updateRoom(room.id, { name: raw })
    return true
  }

  function commitDimension(axis: 'x' | 'y', raw: string) {
    const result = parseLength(raw, units)
    if (!result.ok) return false
    const newSize = result.value
    const currentSize = axis === 'x' ? bb.width : bb.height
    if (currentSize === 0) return false
    const scale = newSize / currentSize
    const newPoints = room.points.map((p) => ({
      x: axis === 'x' ? bb.x + (p.x - bb.x) * scale : p.x,
      y: axis === 'y' ? bb.y + (p.y - bb.y) * scale : p.y,
    }))
    updateRoom(room.id, { points: newPoints })
    return true
  }

  function commitWallThickness(raw: string) {
    const result = parseLength(raw, units)
    if (!result.ok) return false
    updateRoom(room.id, { wallThickness: result.value })
    return true
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Room</div>
      <UndoableField label="Name" value={room.name} onCommit={commitName} />
      <UndoableField label="Width" type="number" value={bb.width.toFixed(1)} onCommit={(raw) => commitDimension('x', raw)} />
      <div className={styles.hint}>{formatLength(bb.width, units)}</div>
      <UndoableField label="Height" type="number" value={bb.height.toFixed(1)} onCommit={(raw) => commitDimension('y', raw)} />
      <div className={styles.hint}>{formatLength(bb.height, units)}</div>
      <UndoableField
        label="Wall Thickness"
        type="number"
        value={room.wallThickness.toFixed(2)}
        onCommit={commitWallThickness}
      />
      <div className={styles.hint}>{formatLength(room.wallThickness, units)} (overrides project default)</div>
    </div>
  )
}

function InteriorWallProperties({ wall }: { wall: InteriorWall }) {
  const units = useProjectStore((s) => s.project.settings.units)
  const updateInteriorWall = useProjectStore((s) => s.updateInteriorWall)
  const currentLength = distance(wall.a, wall.b)

  function commitLength(raw: string) {
    const result = parseLength(raw, units)
    if (!result.ok) return false
    const newLength = result.value
    const dx = wall.b.x - wall.a.x
    const dy = wall.b.y - wall.a.y
    if (currentLength === 0) return false
    const dirX = dx / currentLength
    const dirY = dy / currentLength
    const newB = { x: wall.a.x + dirX * newLength, y: wall.a.y + dirY * newLength }
    updateInteriorWall(wall.id, { b: newB })
    return true
  }

  function commitThickness(raw: string) {
    const result = parseLength(raw, units)
    if (!result.ok) return false
    updateInteriorWall(wall.id, { thickness: result.value })
    return true
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Interior Wall</div>
      <UndoableField label="Length" type="number" value={currentLength.toFixed(1)} onCommit={commitLength} />
      <div className={styles.hint}>{formatLength(currentLength, units)}</div>
      <UndoableField
        label="Wall Thickness"
        type="number"
        value={wall.thickness.toFixed(2)}
        onCommit={commitThickness}
      />
      <div className={styles.hint}>{formatLength(wall.thickness, units)}</div>
    </div>
  )
}

function FurnitureProperties({ instance }: { instance: FurnitureInstance }) {
  const units = useProjectStore((s) => s.project.settings.units)
  const updateFurniture = useProjectStore((s) => s.updateFurniture)
  const colorSnapshotTaken = useRef(false)

  function commitLabel(raw: string) {
    updateFurniture(instance.id, { label: raw.trim() === '' ? null : raw })
    return true
  }

  function commitWidth(raw: string) {
    const result = parseLength(raw, units)
    if (!result.ok) return false
    updateFurniture(instance.id, { width: Math.max(MIN_FURNITURE_SIZE, result.value) })
    return true
  }

  function commitDepth(raw: string) {
    const result = parseLength(raw, units)
    if (!result.ok) return false
    updateFurniture(instance.id, { depth: Math.max(MIN_FURNITURE_SIZE, result.value) })
    return true
  }

  function commitRotation(raw: string) {
    const value = Number(raw)
    if (!Number.isFinite(value)) return false
    updateFurniture(instance.id, { rotation: ((value % 360) + 360) % 360 })
    return true
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Furniture</div>
      <UndoableField label="Label" value={instance.label ?? ''} onCommit={commitLabel} />
      <UndoableField label="Width" type="number" value={instance.width.toFixed(1)} onCommit={commitWidth} />
      <div className={styles.hint}>{formatLength(instance.width, units)}</div>
      <UndoableField label="Depth" type="number" value={instance.depth.toFixed(1)} onCommit={commitDepth} />
      <div className={styles.hint}>{formatLength(instance.depth, units)}</div>
      <UndoableField
        label="Rotation"
        type="number"
        value={instance.rotation.toFixed(0)}
        onCommit={commitRotation}
      />
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Color</span>
        <input
          className={styles.input}
          type="color"
          value={instance.fillColor}
          onMouseDown={() => {
            if (colorSnapshotTaken.current) return
            colorSnapshotTaken.current = true
            useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
          }}
          onChange={(e) => updateFurniture(instance.id, { fillColor: e.target.value })}
          onBlur={() => {
            colorSnapshotTaken.current = false
          }}
        />
      </label>
    </div>
  )
}

export function PropertiesPanel() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const selectedWall = useUIStore((s) => s.selectedWall)
  const selectedInteriorWall = useUIStore((s) => s.selectedInteriorWall)
  const rooms = useProjectStore((s) => s.project.rooms)
  const interiorWalls = useProjectStore((s) => s.project.interiorWalls)
  const furnitureInstances = useProjectStore((s) => s.project.furnitureInstances)

  const selectedRoom =
    selectedIds.length === 1 ? rooms.find((r) => r.id === selectedIds[0]) : undefined
  const selectedWallEntity = selectedInteriorWall
    ? interiorWalls.find((w) => w.id === selectedInteriorWall.wallId)
    : undefined
  const selectedFurniture =
    selectedIds.length === 1 ? furnitureInstances.find((f) => f.id === selectedIds[0]) : undefined

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Properties</div>
      <div className={styles.body}>
        {!selectedRoom && !selectedWallEntity && !selectedFurniture && selectedIds.length === 0 && (
          <p className={styles.empty}>Nothing selected</p>
        )}
        {!selectedRoom && !selectedWallEntity && !selectedFurniture && selectedIds.length > 0 && (
          <p className={styles.empty}>{selectedIds.length} item(s) selected</p>
        )}
        {selectedWallEntity && <InteriorWallProperties wall={selectedWallEntity} />}
        {selectedRoom && selectedWall && selectedWall.roomId === selectedRoom.id && (
          <WallProperties room={selectedRoom} edgeIndex={selectedWall.edgeIndex} />
        )}
        {selectedRoom && (!selectedWall || selectedWall.roomId !== selectedRoom.id) && (
          <RoomProperties room={selectedRoom} />
        )}
        {!selectedRoom && !selectedWallEntity && selectedFurniture && (
          <FurnitureProperties instance={selectedFurniture} />
        )}
      </div>
    </div>
  )
}
