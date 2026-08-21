import { useMemo, useState } from 'react'
import type { FurnitureInstance } from '../types/project'
import { useLibraryStore } from '../store/libraryStore'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'
import { useUIStore } from '../store/uiStore'
import { pieceFromInstance } from '../furniture/library'
import { formatLength } from '../utils/units'
import { Overlay } from './Overlay'
import styles from './dialog.module.css'

interface Props {
  instance: FurnitureInstance
  onClose: () => void
}

/** Sentinel for the "create a set while saving" option, so the set picker
 * stays a single control instead of a picker plus a separate new-set flow. */
const NEW_SET = '__new__'
/** Sentinel for "file this as a new piece" rather than replacing one. */
const NEW_PIECE = '__new__'

/** Captures the selected item's current size, color and label as a reusable
 * piece and files it in a set. Saving over an existing piece is the "update"
 * path - the piece keeps its id, so instances already placed from it still
 * resolve. */
export function SaveToSetDialog({ instance, onClose }: Props) {
  const units = useProjectStore((s) => s.project.settings.units)
  const updateFurniture = useProjectStore((s) => s.updateFurniture)
  const library = useLibraryStore((s) => s.library)
  const createSet = useLibraryStore((s) => s.createSet)
  const savePiece = useLibraryStore((s) => s.savePiece)
  const setCatalogTab = useUIStore((s) => s.setCatalogTab)

  const [name, setName] = useState(instance.label ?? 'Furniture')
  const [setId, setSetId] = useState(library.sets[0]?.id ?? NEW_SET)
  const [newSetName, setNewSetName] = useState('')
  const [targetPieceId, setTargetPieceId] = useState(NEW_PIECE)

  const setPieces = useMemo(
    () => (setId === NEW_SET ? [] : library.pieces.filter((p) => p.setId === setId)),
    [library.pieces, setId],
  )

  const creatingSet = setId === NEW_SET
  const canSave = name.trim() !== '' && (!creatingSet || newSetName.trim() !== '')

  function handleSetChange(next: string) {
    setSetId(next)
    // The overwrite target belongs to the previous set - drop it rather than
    // silently saving into a set the user just navigated away from.
    setTargetPieceId(NEW_PIECE)
  }

  function handleTargetChange(next: string) {
    setTargetPieceId(next)
    const target = library.pieces.find((p) => p.id === next)
    if (target) setName(target.name)
  }

  function handleSave() {
    if (!canSave) return
    const targetSetId = creatingSet ? createSet(newSetName) : setId
    const existingId = targetPieceId === NEW_PIECE ? undefined : targetPieceId
    const piece = pieceFromInstance(instance, name, targetSetId, existingId)
    savePiece(piece)
    // The item now *is* an instance of the saved piece, so "Reset to default"
    // means "back to my piece" rather than back to the built-in it started
    // from - which would silently discard what was just saved. Its label
    // follows the piece's name for the same reason: leaving them different
    // would make Reset immediately available and rename the item.
    const patch: Partial<FurnitureInstance> = {}
    if (instance.definitionId !== piece.id) patch.definitionId = piece.id
    if (instance.label !== piece.name) patch.label = piece.name
    // A real project change, so one snapshot - and none at all when saving
    // over the piece this item already matches.
    if (Object.keys(patch).length > 0) {
      useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
      updateFurniture(instance.id, patch)
    }
    // Show the user where it landed.
    setCatalogTab('sets')
    onClose()
  }

  return (
    <Overlay onClose={onClose} className={styles.overlay} contentClassName={styles.modal}>
      <div className={styles.header}>
        <span>Save to set</span>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Piece name</span>
          <input
            className={styles.input}
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              else if (e.key === 'Escape') onClose()
            }}
          />
        </label>
        <div className={styles.hint}>
          Saves this item&rsquo;s current size and color: {formatLength(instance.width, units)} ×{' '}
          {formatLength(instance.depth, units)}.
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Set</span>
          <select
            className={styles.select}
            value={setId}
            onChange={(e) => handleSetChange(e.target.value)}
          >
            {library.sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={NEW_SET}>New set…</option>
          </select>
        </label>

        {creatingSet && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>New set name</span>
            <input
              className={styles.input}
              type="text"
              value={newSetName}
              placeholder="e.g. My Apartment"
              onChange={(e) => setNewSetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                else if (e.key === 'Escape') onClose()
              }}
            />
          </label>
        )}

        {setPieces.length > 0 && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Save as</span>
            <select
              className={styles.select}
              value={targetPieceId}
              onChange={(e) => handleTargetChange(e.target.value)}
            >
              <option value={NEW_PIECE}>New piece</option>
              {setPieces.map((p) => (
                <option key={p.id} value={p.id}>
                  Replace “{p.name}”
                </option>
              ))}
            </select>
          </label>
        )}
        <div className={styles.hint}>
          {targetPieceId === NEW_PIECE
            ? 'Saved sets live in this browser and travel inside saved project files.'
            : 'Replacing overwrites that saved piece. Sets are outside undo, so this cannot be undone.'}
        </div>

        <div className={styles.actions}>
          <button className={styles.button} onClick={handleSave} disabled={!canSave}>
            Save
          </button>
          <button className={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}
