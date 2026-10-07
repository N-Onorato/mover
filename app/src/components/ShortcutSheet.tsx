import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { Overlay } from './Overlay'
import { usePresence } from '../hooks/usePresence'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { findShortcut, matchesShortcut, shortcutGroups } from '../keyboard/shortcuts'
import styles from './ShortcutSheet.module.css'

/** Matches the longest closing animation in ShortcutSheet.module.css. */
const EXIT_MS = 150

/** Pointer actions in gesture entries, styled apart from real keys. */
const MOUSE_ACTIONS = new Set(['Drag', 'Middle-drag', 'Scroll', 'Double-click'])

interface Props {
  open: boolean
  onClose: () => void
}

/** I5 (#24): the `?` keyboard-shortcut cheat sheet. Everything listed is
 * rendered from the registry in keyboard/shortcuts.ts - the same table the
 * menus, toolbar and tools bind their keys from - so it can't go stale. */
export function ShortcutSheet({ open, onClose }: Props) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const { mounted, state } = usePresence(open, reduceMotion ? 0 : EXIT_MS)
  const groups = useMemo(() => shortcutGroups(), [])
  const sheetRef = useRef<HTMLDivElement>(null)

  // Modal keyboard handling. Capture phase on window runs ahead of every
  // other keydown listener in the app (all bubble-phase), so Escape here
  // closes the sheet without also cancelling a room being drawn underneath,
  // and Ctrl+Z can't undo behind it.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      e.stopPropagation()
      if (e.key === 'Escape' || matchesShortcut(e, 'help.shortcuts')) {
        e.preventDefault()
        onClose()
        return
      }
      // Swallowed app shortcuts mustn't fall through to the browser's own
      // binding for the same chord (Ctrl+S save-page, Ctrl+= page zoom).
      if (findShortcut(e, 'global')) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  // Take focus while open so screen readers land in the dialog, and hand it
  // back to whatever had it (often the menu bar) on close.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    sheetRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open])

  if (!mounted) return null

  const closing = state === 'closing'
  return (
    <Overlay
      onClose={onClose}
      className={`${styles.overlay} ${closing ? styles.closing : ''}`}
      contentClassName={styles.sheet}
    >
      <div
        ref={sheetRef}
        className={styles.inner}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-sheet-title"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <span id="shortcut-sheet-title" className={styles.title}>
            <kbd className={`${styles.key} ${styles.pressKey}`}>?</kbd>
            Keyboard Shortcuts
          </span>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
          {groups.map((group, i) => (
            <section
              key={group.category}
              className={styles.group}
              style={{ '--i': i } as CSSProperties}
            >
              <h3 className={styles.groupTitle}>{group.category}</h3>
              {group.items.map((item) => (
                <div key={item.id} className={styles.row}>
                  <span className={styles.label}>{item.label}</span>
                  <span className={styles.keys}>
                    {item.keycaps.map((caps, alt) => (
                      <span key={alt} className={styles.combo}>
                        {alt > 0 && <span className={styles.or}>or</span>}
                        {caps.map((cap, c) => (
                          <span key={c} className={styles.combo}>
                            {c > 0 && <span className={styles.plus}>+</span>}
                            <kbd className={MOUSE_ACTIONS.has(cap) ? styles.mouse : styles.key}>
                              {cap}
                            </kbd>
                          </span>
                        ))}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className={styles.footer}>
          Press <kbd className={styles.key}>?</kbd> or <kbd className={styles.key}>Esc</kbd> to
          close
        </div>
      </div>
    </Overlay>
  )
}
