import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'
import { distance, polygonBoundingBox } from '../utils/geometry'
import { formatLength } from '../utils/units'
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

function WallProperties({ room, edgeIndex }: { room: Room; edgeIndex: number }) {
  const units = useProjectStore((s) => s.project.settings.units)
  const updateRoom = useProjectStore((s) => s.updateRoom)
  const snapshot = useSnapshotOnFocus()

  const a = room.points[edgeIndex]
  const b = room.points[(edgeIndex + 1) % room.points.length]
  const currentLength = distance(a, b)

  const [value, setValue] = useState(currentLength.toFixed(1))
  useEffect(() => setValue(currentLength.toFixed(1)), [currentLength])

  function commit() {
    const newLength = parseFloat(value)
    if (!Number.isFinite(newLength) || newLength <= 0) {
      setValue(currentLength.toFixed(1))
      return
    }
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return
    const dirX = dx / len
    const dirY = dy / len
    const newB = { x: a.x + dirX * newLength, y: a.y + dirY * newLength }
    const newPoints = room.points.map((p, i) => (i === (edgeIndex + 1) % room.points.length ? newB : p))
    updateRoom(room.id, { points: newPoints })
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Wall</div>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Length</span>
        <input
          className={styles.input}
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={snapshot.onFocus}
          onBlur={() => {
            commit()
            snapshot.onBlur()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </label>
      <div className={styles.hint}>{formatLength(currentLength, units)}</div>
    </div>
  )
}

function RoomProperties({ room }: { room: Room }) {
  const units = useProjectStore((s) => s.project.settings.units)
  const updateRoom = useProjectStore((s) => s.updateRoom)
  const snapshot = useSnapshotOnFocus()

  const bb = polygonBoundingBox(room.points)
  const [name, setName] = useState(room.name)
  const [width, setWidth] = useState(bb.width.toFixed(1))
  const [height, setHeight] = useState(bb.height.toFixed(1))

  useEffect(() => setName(room.name), [room.name])
  useEffect(() => setWidth(bb.width.toFixed(1)), [bb.width])
  useEffect(() => setHeight(bb.height.toFixed(1)), [bb.height])

  function commitName() {
    if (name !== room.name) updateRoom(room.id, { name })
  }

  function commitWidth() {
    const newWidth = parseFloat(width)
    if (!Number.isFinite(newWidth) || newWidth <= 0 || bb.width === 0) {
      setWidth(bb.width.toFixed(1))
      return
    }
    const scaleX = newWidth / bb.width
    const newPoints = room.points.map((p) => ({ x: bb.x + (p.x - bb.x) * scaleX, y: p.y }))
    updateRoom(room.id, { points: newPoints })
  }

  function commitHeight() {
    const newHeight = parseFloat(height)
    if (!Number.isFinite(newHeight) || newHeight <= 0 || bb.height === 0) {
      setHeight(bb.height.toFixed(1))
      return
    }
    const scaleY = newHeight / bb.height
    const newPoints = room.points.map((p) => ({ x: p.x, y: bb.y + (p.y - bb.y) * scaleY }))
    updateRoom(room.id, { points: newPoints })
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Room</div>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Name</span>
        <input
          className={styles.input}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={snapshot.onFocus}
          onBlur={() => {
            commitName()
            snapshot.onBlur()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Width</span>
        <input
          className={styles.input}
          type="number"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          onFocus={snapshot.onFocus}
          onBlur={() => {
            commitWidth()
            snapshot.onBlur()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </label>
      <div className={styles.hint}>{formatLength(bb.width, units)}</div>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Height</span>
        <input
          className={styles.input}
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          onFocus={snapshot.onFocus}
          onBlur={() => {
            commitHeight()
            snapshot.onBlur()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </label>
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
