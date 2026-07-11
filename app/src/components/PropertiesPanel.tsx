import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'
import { distance, polygonBoundingBox } from '../utils/geometry'
import { formatLength, parseLength } from '../utils/units'
import type { Room } from '../types/project'
import styles from './PropertiesPanel.module.css'

function useSnapshotOnFocus() {
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

function UndoableField({ label, value, type = 'text', onCommit }: UndoableFieldProps) {
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
    const len = currentLength
    if (len === 0) return false
    const dirX = dx / len
    const dirY = dy / len
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

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Room</div>
      <UndoableField label="Name" value={room.name} onCommit={commitName} />
      <UndoableField label="Width" type="number" value={bb.width.toFixed(1)} onCommit={(raw) => commitDimension('x', raw)} />
      <div className={styles.hint}>{formatLength(bb.width, units)}</div>
      <UndoableField label="Height" type="number" value={bb.height.toFixed(1)} onCommit={(raw) => commitDimension('y', raw)} />
      <div className={styles.hint}>{formatLength(bb.height, units)}</div>
    </div>
  )
}

export function PropertiesPanel() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const selectedWall = useUIStore((s) => s.selectedWall)
  const rooms = useProjectStore((s) => s.project.rooms)

  const selectedRoom =
    selectedIds.length === 1 ? rooms.find((r) => r.id === selectedIds[0]) : undefined

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Properties</div>
      <div className={styles.body}>
        {!selectedRoom && selectedIds.length === 0 && (
          <p className={styles.empty}>Nothing selected</p>
        )}
        {!selectedRoom && selectedIds.length > 0 && (
          <p className={styles.empty}>{selectedIds.length} item(s) selected</p>
        )}
        {selectedRoom && selectedWall && selectedWall.roomId === selectedRoom.id && (
          <WallProperties room={selectedRoom} edgeIndex={selectedWall.edgeIndex} />
        )}
        {selectedRoom && (!selectedWall || selectedWall.roomId !== selectedRoom.id) && (
          <RoomProperties room={selectedRoom} />
        )}
      </div>
    </div>
  )
}
