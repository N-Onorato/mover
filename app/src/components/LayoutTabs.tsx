import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { placeMenu } from './menuPlacement'
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
 *
 * O4 (#44): the per-tab action menu is portaled to `document.body` and
 * positioned with `position: fixed` from the `⋯` button's rect. It used to be
 * an absolutely positioned child of the tab, but the strip's `overflow-x:
 * auto` makes it a scroll container on both axes, which clipped the menu out
 * of sight.
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
  const tabsRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /** The `⋯` button the open menu hangs off: positions the menu and gets
   * focus back when it closes. */
  const anchorRef = useRef<HTMLButtonElement | null>(null)

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuFor(null)
    if (restoreFocus) anchorRef.current?.focus({ preventScroll: true })
  }, [])

  // Position and focus before paint, once the menu is mounted and its size is
  // measurable. Written straight to the node (rather than through state) so
  // the first painted frame is already in the right place.
  useLayoutEffect(() => {
    const menu = menuRef.current
    const anchor = anchorRef.current
    if (menuFor === null || !menu || !anchor) return
    const { width, height } = menu.getBoundingClientRect()
    const pos = placeMenu(
      anchor.getBoundingClientRect(),
      { width, height },
      { width: window.innerWidth, height: window.innerHeight },
    )
    menu.style.left = `${pos.left}px`
    menu.style.top = `${pos.top}px`
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [menuFor])

  useEffect(() => {
    if (menuFor === null) return
    function onDocPointerDown(e: MouseEvent) {
      // The menu lives outside rootRef (it is portaled), so a press inside it
      // has to be counted as inside explicitly.
      const target = e.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeMenu(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closeMenu(true)
    }
    // A fixed menu doesn't follow its button, so anything that moves the
    // button (strip scroll, window resize) closes the menu instead.
    const onMoved = () => closeMenu(true)
    const strip = tabsRef.current
    document.addEventListener('mousedown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    strip?.addEventListener('scroll', onMoved)
    window.addEventListener('resize', onMoved)
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
      strip?.removeEventListener('scroll', onMoved)
      window.removeEventListener('resize', onMoved)
    }
  }, [menuFor, closeMenu])

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const entries = [
      ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ]
    if (entries.length === 0) return
    const at = entries.indexOf(document.activeElement as HTMLButtonElement)
    let next: number
    switch (e.key) {
      case 'ArrowDown':
        next = (at + 1) % entries.length
        break
      case 'ArrowUp':
        next = (at - 1 + entries.length) % entries.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = entries.length - 1
        break
      case 'Tab':
        // Tabbing out of a popup menu dismisses it, as native menus do.
        closeMenu(true)
        e.preventDefault()
        return
      default:
        return
    }
    e.preventDefault()
    entries[next].focus()
  }

  const renaming = layouts.find((l) => l.id === renamingId)
  const menuLayout = layouts.find((l) => l.id === menuFor)
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
      <div className={styles.tabs} role="tablist" aria-label="Furniture layouts" ref={tabsRef}>
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
                onClick={(e) => {
                  anchorRef.current = e.currentTarget
                  setMenuFor(menuFor === layout.id ? null : layout.id)
                }}
                aria-label={`Actions for ${layout.name}`}
                aria-haspopup="menu"
                aria-expanded={menuFor === layout.id}
              >
                ⋯
              </button>
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
      {menuLayout &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            role="menu"
            aria-label={`Actions for ${menuLayout.name}`}
            onKeyDown={handleMenuKeyDown}
          >
            <button
              role="menuitem"
              className={styles.entry}
              onClick={() => {
                closeMenu(true)
                setRenamingId(menuLayout.id)
              }}
            >
              Rename...
            </button>
            <button
              role="menuitem"
              className={styles.entry}
              onClick={() => {
                closeMenu(true)
                duplicateFurnitureLayoutAndActivate(menuLayout.id)
              }}
            >
              Duplicate
            </button>
            <button
              role="menuitem"
              className={styles.entry}
              disabled={!canDelete}
              title={canDelete ? undefined : 'A project keeps at least one layout'}
              onClick={() => {
                closeMenu(true)
                deleteFurnitureLayout(menuLayout.id)
              }}
            >
              Delete
            </button>
          </div>,
          document.body,
        )}
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
