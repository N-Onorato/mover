import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'
import { formatShortcut, isTypingTarget, matchesShortcut } from '../keyboard/shortcuts'
import { buildMenus } from './menus'
import styles from './MenuBar.module.css'

interface MenuBarProps {
  onOpenSettings?: () => void
  onOpenShortcuts?: () => void
}

export function MenuBar({ onOpenSettings, onOpenShortcuts }: MenuBarProps = {}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const showGrid = useUIStore((s) => s.showGrid)
  const view = useUIStore((s) => s.view)
  const hasSelection = useUIStore((s) => s.selectedIds.length > 0)
  const snapToGrid = useProjectStore((s) => s.project.settings.snapToGrid)
  const units = useProjectStore((s) => s.project.settings.units)
  const rulerMode = useProjectStore((s) => s.project.settings.rulerMode)
  const canUndo = useHistoryStore((s) => s.past.length > 0)
  const canRedo = useHistoryStore((s) => s.future.length > 0)

  const menus = useMemo(
    () =>
      buildMenus({
        showGrid,
        snapToGrid,
        units,
        rulerMode,
        view,
        hasSelection,
        canUndo,
        canRedo,
        onOpenSettings,
        onOpenShortcuts,
      }),
    [
      showGrid,
      snapToGrid,
      units,
      rulerMode,
      view,
      hasSelection,
      canUndo,
      canRedo,
      onOpenSettings,
      onOpenShortcuts,
    ],
  )
  // Read by the keydown listener below, which is registered once - so the
  // zoom entries act on the live view rather than the one at mount.
  const menusRef = useRef(menus)
  menusRef.current = menus

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      if (e.key === 'Escape') {
        setOpenMenu(null)
        return
      }
      // Every menu shortcut is dispatched from the menu entries themselves,
      // so an entry can't advertise a key that does nothing (#24). Disabled
      // entries still swallow their key: Backspace outside a field would
      // otherwise "navigate back" in some browsers, and Ctrl+S/Ctrl+= would
      // fall through to the browser's own save/zoom.
      for (const menu of menusRef.current) {
        for (const entry of menu.entries) {
          if (entry === 'separator' || !entry.shortcutId) continue
          // The Help entry's '?' toggles the sheet; App owns that binding.
          if (entry.shortcutId === 'help.shortcuts') continue
          if (!matchesShortcut(e, entry.shortcutId)) continue
          e.preventDefault()
          if (!entry.disabled) entry.onSelect?.()
          return
        }
      }
    }
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div className={styles.menuBar} ref={rootRef}>
      {menus.map((menu) => (
        <div
          key={menu.label}
          className={`${styles.menuItem} ${openMenu === menu.label ? styles.open : ''}`}
        >
          <div
            className={styles.menuLabel}
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
            onMouseEnter={() => {
              if (openMenu !== null) setOpenMenu(menu.label)
            }}
          >
            {menu.label}
          </div>
          {openMenu === menu.label && (
            <div className={styles.dropdown}>
              {menu.entries.map((entry, i) =>
                entry === 'separator' ? (
                  <div key={i} className={styles.separator} />
                ) : (
                  <button
                    key={entry.label}
                    className={styles.entry}
                    disabled={entry.disabled}
                    onClick={() => {
                      entry.onSelect?.()
                      setOpenMenu(null)
                    }}
                  >
                    <span>
                      {entry.checked !== undefined && (
                        <span className={styles.check}>{entry.checked ? '✓' : ''}</span>
                      )}
                      {entry.label}
                    </span>
                    {entry.shortcutId && (
                      <span className={styles.shortcut}>{formatShortcut(entry.shortcutId)}</span>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
