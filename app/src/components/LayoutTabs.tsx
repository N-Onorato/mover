import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../store/uiStore'
import {
  activateFurnitureLayout,
  createFurnitureLayoutAndActivate,
  deleteFurnitureLayout,
  duplicateFurnitureLayoutAndActivate,
  renameFurnitureLayout,
} from '../project/layoutActions'
import { activeFurnitureLayout } from '../project/layouts'
import { PromptDialog } from './PromptDialog'
import styles from './LayoutTabs.module.css'

/** L1 (#28): the furniture-layout tab strip above the canvas.
 *
 * One tab per variant of the arrangement. Clicking a tab makes it the layout
 * the tools edit; "Compare" turns the canvas column into a side-by-side of
 * the checked tabs (LayoutWorkspace draws them). The checkboxes only appear
 * in compare mode, where they mean something - out of compare mode a tab is
 * just a switch.
 *
 * Layout create/rename/duplicate/delete all push a history snapshot, so a
 * deleted layout comes back with Undo. That's why the delete entry has no
 * confirmation dialog: it's as reversible as deleting a room.
 */
export function LayoutTabs() {
  const layouts = useProjectStore((s) => s.project.furnitureLayouts)
  const activeId = useProjectStore((s) => activeFurnitureLayout(s.project)?.id)
  const compareMode = useUIStore((s) => s.compareMode)
  const comparedLayoutIds = useUIStore((s) => s.comparedLayoutIds)
  const openComparison = useUIStore((s) => s.openComparison)
  const closeComparison = useUIStore((s) => s.closeComparison)
  const toggleComparedLayout = useUIStore((s) => s.toggleComparedLayout)

  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (menuFor === null) return
    function onDocPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuFor(null)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [menuFor])

  const renaming = layouts.find((l) => l.id === renamingId)
  const canDelete = layouts.length > 1

  function handleToggleCompare() {
    if (compareMode) {
      closeComparison()
    } else {
      // Opening with every layout checked is the answer to "show me my
      // variants" - narrowing down is a second click, finding the checkboxes
      // to opt each one in would be a first one.
      openComparison(layouts.map((l) => l.id))
    }
  }

  return (
    <div className={styles.bar} ref={rootRef}>
      <div className={styles.tabs} role="tablist" aria-label="Furniture layouts">
        {layouts.map((layout) => {
          const isActive = layout.id === activeId
          const inComparison = isActive || comparedLayoutIds.includes(layout.id)
          return (
            <div
              key={layout.id}
              className={`${styles.tab} ${isActive ? styles.active : ''}`}
            >
              {compareMode && (
                <input
                  type="checkbox"
                  className={styles.compareCheck}
                  checked={inComparison}
                  // The layout being edited is always on screen - unchecking
                  // it would hide the canvas the tools act on.
                  disabled={isActive}
                  onChange={() => toggleComparedLayout(layout.id)}
                  aria-label={`Show ${layout.name} in the comparison`}
                  title={
                    isActive
                      ? 'The layout you are editing is always shown'
                      : `Show ${layout.name} side by side`
                  }
                />
              )}
              <button
                role="tab"
                aria-selected={isActive}
                className={styles.tabLabel}
                onClick={() => activateFurnitureLayout(layout.id)}
                onDoubleClick={() => setRenamingId(layout.id)}
                title={`${layout.name} — click to edit, double-click to rename`}
              >
                <span className={styles.tabName}>{layout.name}</span>
                <span className={styles.count}>{layout.furnitureInstances.length}</span>
              </button>
              <button
                className={styles.menuButton}
                onClick={() => setMenuFor(menuFor === layout.id ? null : layout.id)}
                aria-label={`Actions for ${layout.name}`}
              >
                ⋯
              </button>
              {menuFor === layout.id && (
                <div className={styles.menu}>
                  <button
                    className={styles.entry}
                    onClick={() => {
                      setMenuFor(null)
                      setRenamingId(layout.id)
                    }}
                  >
                    Rename...
                  </button>
                  <button
                    className={styles.entry}
                    onClick={() => {
                      setMenuFor(null)
                      duplicateFurnitureLayoutAndActivate(layout.id)
                    }}
                  >
                    Duplicate
                  </button>
                  <button
                    className={styles.entry}
                    disabled={!canDelete}
                    title={canDelete ? undefined : 'A project keeps at least one layout'}
                    onClick={() => {
                      setMenuFor(null)
                      deleteFurnitureLayout(layout.id)
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <button
          className={styles.addButton}
          onClick={createFurnitureLayoutAndActivate}
          title="New empty layout over the same rooms"
          aria-label="New layout"
        >
          +
        </button>
      </div>
      <button
        className={`${styles.compareButton} ${compareMode ? styles.compareOn : ''}`}
        onClick={handleToggleCompare}
        disabled={!compareMode && layouts.length < 2}
        title={
          layouts.length < 2
            ? 'Add a second layout to compare arrangements side by side'
            : 'Show layouts side by side'
        }
      >
        {compareMode ? 'Exit compare' : 'Compare'}
      </button>
      {renaming && (
        <PromptDialog
          title="Rename layout"
          label="Layout name"
          initialValue={renaming.name}
          submitLabel="Rename"
          onSubmit={(name) => renameFurnitureLayout(renaming.id, name)}
          onClose={() => setRenamingId(null)}
        />
      )}
    </div>
  )
}
