import { useMemo, useState } from 'react'
import type { FurnitureDefinition } from '../types/project'
import { useLibraryStore } from '../store/libraryStore'
import { groupPieces } from '../furniture/library'
import { PlaceableItem } from './PlaceableItem'
import { PromptDialog } from './PromptDialog'
import { ConfirmDialog } from './ConfirmDialog'
import styles from './CatalogPanel.module.css'

interface Props {
  query: string
  onItemChosen?: () => void
}

/** What the tab currently has open on top of itself. One piece of state
 * rather than a boolean per dialog, so two can't open at once. */
type Modal =
  | { kind: 'newSet' }
  | { kind: 'renameSet'; id: string; name: string }
  | { kind: 'deleteSet'; id: string; name: string; pieceCount: number }
  | { kind: 'renamePiece'; id: string; name: string }
  | { kind: 'deletePiece'; id: string; name: string }

/** Small icon control on a row that is itself draggable and arms placement on
 * click - both guards are required, or hitting delete also arms tap-to-place
 * and starts a ghost drag. */
function RowButton({
  label,
  title,
  onClick,
}: {
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      className={styles.iconBtn}
      title={title}
      aria-label={title}
      draggable={false}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

export function SetsTab({ query, onItemChosen }: Props) {
  const library = useLibraryStore((s) => s.library)
  const persistError = useLibraryStore((s) => s.persistError)
  const createSet = useLibraryStore((s) => s.createSet)
  const renameSet = useLibraryStore((s) => s.renameSet)
  const deleteSet = useLibraryStore((s) => s.deleteSet)
  const renamePiece = useLibraryStore((s) => s.renamePiece)
  const deletePiece = useLibraryStore((s) => s.deletePiece)

  const [collapsed, setCollapsed] = useState<string[]>([])
  const [modal, setModal] = useState<Modal | null>(null)

  const groups = useMemo(() => groupPieces(library, query), [library, query])
  const hasAnything = library.sets.length > 0 || library.pieces.length > 0

  function toggle(key: string) {
    setCollapsed((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]))
  }

  function pieceActions(piece: FurnitureDefinition) {
    return (
      <>
        <RowButton
          label="✎"
          title={`Rename ${piece.name}`}
          onClick={() => setModal({ kind: 'renamePiece', id: piece.id, name: piece.name })}
        />
        <RowButton
          label="×"
          title={`Delete ${piece.name}`}
          onClick={() => setModal({ kind: 'deletePiece', id: piece.id, name: piece.name })}
        />
      </>
    )
  }

  return (
    <>
      <div className={styles.setsHeader}>
        <button className={styles.newSetBtn} onClick={() => setModal({ kind: 'newSet' })}>
          + New set
        </button>
      </div>
      {persistError && (
        <div className={styles.warning}>
          Couldn&rsquo;t save your library in this browser (storage is full). Your pieces are still
          saved inside this project file.
        </div>
      )}
      <div className={styles.list}>
        {!hasAnything && (
          <p className={styles.empty}>
            No saved sets yet. Select a piece of furniture on the canvas, then use{' '}
            <strong>Save to set…</strong> in the Properties panel.
          </p>
        )}
        {hasAnything && groups.length === 0 && (
          <p className={styles.empty}>No saved pieces match “{query}”.</p>
        )}
        {groups.map((group) => {
          // Searching auto-expands: a hit the user can't see is the same as
          // no hit at all.
          const key = group.id ?? '__ungrouped__'
          const isCollapsed = query.trim() === '' && collapsed.includes(key)
          return (
            <div key={key} className={styles.group}>
              <div className={styles.groupHeader} onClick={() => toggle(key)}>
                <span className={styles.groupCaret}>{isCollapsed ? '▸' : '▾'}</span>
                <span className={styles.groupName}>{group.name}</span>
                <span className={styles.groupCount}>{group.pieces.length}</span>
                {group.id && (
                  <span className={styles.itemActions}>
                    <RowButton
                      label="✎"
                      title={`Rename ${group.name}`}
                      onClick={() =>
                        setModal({ kind: 'renameSet', id: group.id!, name: group.name })
                      }
                    />
                    <RowButton
                      label="×"
                      title={`Delete ${group.name}`}
                      onClick={() =>
                        setModal({
                          kind: 'deleteSet',
                          id: group.id!,
                          name: group.name,
                          pieceCount: group.pieces.length,
                        })
                      }
                    />
                  </span>
                )}
              </div>
              {!isCollapsed &&
                (group.pieces.length === 0 ? (
                  <p className={styles.emptyGroup}>No pieces saved here yet.</p>
                ) : (
                  group.pieces.map((piece) => (
                    <PlaceableItem
                      key={piece.id}
                      def={piece}
                      onChosen={onItemChosen}
                      actions={pieceActions(piece)}
                    />
                  ))
                ))}
            </div>
          )
        })}
      </div>

      {modal?.kind === 'newSet' && (
        <PromptDialog
          title="New set"
          label="Set name"
          placeholder="e.g. My Apartment"
          submitLabel="Create"
          hint="Sets are saved in this browser and travel inside saved project files."
          onSubmit={(name) => createSet(name)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'renameSet' && (
        <PromptDialog
          title="Rename set"
          label="Set name"
          initialValue={modal.name}
          onSubmit={(name) => renameSet(modal.id, name)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'renamePiece' && (
        <PromptDialog
          title="Rename piece"
          label="Piece name"
          initialValue={modal.name}
          onSubmit={(name) => renamePiece(modal.id, name)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'deleteSet' && (
        <ConfirmDialog
          title="Delete set"
          message={`Delete “${modal.name}” and the ${modal.pieceCount} piece(s) saved in it? Saved sets are outside undo, so this can't be undone here — though any project file saved earlier still carries a copy.`}
          confirmLabel="Delete set"
          onConfirm={() => deleteSet(modal.id)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'deletePiece' && (
        <ConfirmDialog
          title="Delete piece"
          message={`Delete “${modal.name}” from your library? Furniture already placed from it stays on the canvas. Saved sets are outside undo, so this can't be undone here.`}
          onConfirm={() => deletePiece(modal.id)}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
