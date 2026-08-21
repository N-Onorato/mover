import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'
import { distance, polygonBoundingBox } from '../utils/geometry'
import { formatLength, parseLength } from '../utils/units'
import {
  MIN_FURNITURE_SIZE,
  findDefinition,
  matchesDefault,
  resetPatch,
} from '../furniture/catalog'
import { findPiece } from '../furniture/resolve'
import { useLibraryStore } from '../store/libraryStore'
import { SaveToSetDialog } from './SaveToSetDialog'
import type { Room, InteriorWall, FurnitureInstance, ReferenceImage } from '../types/project'
import { resizeImagePatch, startRecalibration } from '../canvas/tools/ImageTool'
import styles from './PropertiesPanel.module.css'

/** One history snapshot per interaction rather than per change event - a
 * held-down slider or a dragged color swatch would otherwise bury the undo
 * stack under a snapshot per frame. `take` is idempotent until `release`. */
function useSnapshotOnce() {
  const snapshotTaken = useRef(false)
  return {
    take: () => {
      if (snapshotTaken.current) return
      snapshotTaken.current = true
      useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
    },
    release: () => {
      snapshotTaken.current = false
    },
  }
}

/** useSnapshotOnce bound to a text field's focus/blur - the interaction
 * boundary for a typed edit. */
export function useSnapshotOnFocus() {
  const { take, release } = useSnapshotOnce()
  return { onFocus: take, onBlur: release }
}

/** Shared by every rotation field: parses degrees and wraps into [0, 360),
 * or null when the input isn't a number. */
function parseRotation(raw: string): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return ((value % 360) + 360) % 360
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
  const colorSnapshot = useSnapshotOnce()
  const [saveOpen, setSaveOpen] = useState(false)
  // Subscribed rather than resolved through resolveDefinition's getState, so
  // saving or deleting the piece this item came from re-renders the buttons.
  const pieces = useLibraryStore((s) => s.library.pieces)
  const definition =
    findDefinition(instance.definitionId) ?? findPiece(pieces, instance.definitionId)
  const isDefault = definition ? matchesDefault(instance, definition) : true

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
    const rotation = parseRotation(raw)
    if (rotation === null) return false
    updateFurniture(instance.id, { rotation })
    return true
  }

  function handleReset() {
    if (!definition) return
    useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
    updateFurniture(instance.id, resetPatch(definition))
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
          // Pointer, not mouse: a touch drag on the swatch has to snapshot too.
          onPointerDown={colorSnapshot.take}
          onChange={(e) => updateFurniture(instance.id, { fillColor: e.target.value })}
          onBlur={colorSnapshot.release}
        />
      </label>
      <button className={styles.button} onClick={handleReset} disabled={!definition || isDefault}>
        Reset to default
      </button>
      <div className={styles.hint}>
        {!definition
          ? 'This item came from a saved piece that no longer exists, so there are no defaults to restore.'
          : isDefault
            ? `Already matches ${definition.name}.`
            : `Restores the size, color and label of ${definition.name}. Position and rotation stay put.`}
      </div>
      <button className={styles.button} onClick={() => setSaveOpen(true)}>
        Save to set…
      </button>
      <div className={styles.hint}>
        Keeps this item&rsquo;s size and color as a reusable piece in the catalog&rsquo;s Sets tab.
      </div>
      {saveOpen && <SaveToSetDialog instance={instance} onClose={() => setSaveOpen(false)} />}
    </div>
  )
}

/** Minimum on-canvas size for a reference image, in world units - stops a
 * fat-fingered width of 0 from making the image unselectable. */
const MIN_IMAGE_SIZE = 1

function ImageProperties({ image }: { image: ReferenceImage }) {
  const units = useProjectStore((s) => s.project.settings.units)
  const updateReferenceImage = useProjectStore((s) => s.updateReferenceImage)
  // Pointer and key events, so touch and keyboard adjustment of the slider
  // snapshot too. Mirrors the color swatch in FurnitureProperties.
  const opacitySnapshot = useSnapshotOnce()

  function commitName(raw: string) {
    updateReferenceImage(image.id, { name: raw.trim() === '' ? 'Reference Image' : raw })
    return true
  }

  // Width and height are one control in two boxes: editing either rescales the
  // image uniformly, so the photo can't be stretched out of proportion.
  function commitScaledSize(raw: string, current: number) {
    const result = parseLength(raw, units)
    if (!result.ok) return false
    const patch = resizeImagePatch(image, Math.max(MIN_IMAGE_SIZE, result.value) / current)
    if (!patch) return false
    updateReferenceImage(image.id, patch)
    return true
  }

  function commitRotation(raw: string) {
    const rotation = parseRotation(raw)
    if (rotation === null) return false
    updateReferenceImage(image.id, { rotation })
    return true
  }

  const opacityPct = Math.round(image.opacity * 100)

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Reference Image</div>
      <UndoableField label="Name" value={image.name} onCommit={commitName} />
      <UndoableField
        label="Width"
        type="number"
        value={image.width.toFixed(1)}
        onCommit={(raw) => commitScaledSize(raw, image.width)}
      />
      <div className={styles.hint}>{formatLength(image.width, units)}</div>
      <UndoableField
        label="Height"
        type="number"
        value={image.height.toFixed(1)}
        onCommit={(raw) => commitScaledSize(raw, image.height)}
      />
      <div className={styles.hint}>
        {formatLength(image.height, units)} — width and height scale together to keep the photo in
        proportion.
      </div>
      <UndoableField
        label="Rotation"
        type="number"
        value={image.rotation.toFixed(0)}
        onCommit={commitRotation}
      />
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Opacity</span>
        <input
          className={styles.range}
          type="range"
          min={0}
          max={100}
          step={1}
          value={opacityPct}
          onPointerDown={opacitySnapshot.take}
          onKeyDown={opacitySnapshot.take}
          onChange={(e) => updateReferenceImage(image.id, { opacity: Number(e.target.value) / 100 })}
          onPointerUp={opacitySnapshot.release}
          onBlur={opacitySnapshot.release}
        />
      </label>
      <div className={styles.hint}>{opacityPct}%</div>
      <div className={styles.hint}>
        {image.calibration
          ? `Calibrated: ${formatLength(image.calibration.realWorldDistance, units)} reference line`
          : 'Not calibrated — this photo has no real-world scale yet.'}
      </div>
      <button className={styles.button} onClick={() => startRecalibration(image.id)}>
        Recalibrate
      </button>
      <div className={styles.hint}>
        Click two points on the photo and enter the real distance between them.
      </div>
    </div>
  )
}

export function PropertiesPanel() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const selectedWall = useUIStore((s) => s.selectedWall)
  const rooms = useProjectStore((s) => s.project.rooms)
  const interiorWalls = useProjectStore((s) => s.project.interiorWalls)
  const furnitureInstances = useProjectStore((s) => s.project.furnitureInstances)
  const referenceImages = useProjectStore((s) => s.project.referenceImages)

  const selectedRoom =
    selectedIds.length === 1 ? rooms.find((r) => r.id === selectedIds[0]) : undefined
  const selectedWallEntity =
    selectedIds.length === 1 ? interiorWalls.find((w) => w.id === selectedIds[0]) : undefined
  const selectedFurniture =
    selectedIds.length === 1 ? furnitureInstances.find((f) => f.id === selectedIds[0]) : undefined
  const selectedImage =
    selectedIds.length === 1 ? referenceImages.find((img) => img.id === selectedIds[0]) : undefined

  // Stated once rather than repeated per empty-state branch, so a new entity
  // type is one edit here instead of one per branch.
  const hasSingleSelection = !!(
    selectedRoom ||
    selectedWallEntity ||
    selectedFurniture ||
    selectedImage
  )

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Properties</div>
      <div className={styles.body}>
        {!hasSingleSelection && (
          <p className={styles.empty}>
            {selectedIds.length === 0
              ? 'Nothing selected'
              : `${selectedIds.length} item(s) selected`}
          </p>
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
        {!selectedRoom && !selectedWallEntity && !selectedFurniture && selectedImage && (
          <ImageProperties image={selectedImage} />
        )}
      </div>
    </div>
  )
}
