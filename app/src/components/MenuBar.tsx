import { useEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import { downloadProject } from '../io/save'
import { openProjectFile, LoadError } from '../io/load'
import { exportStageToPng } from '../io/exportPng'
import { getStage } from '../canvas/stageRegistry'
import { startImageImport } from '../canvas/tools/ImageTool'
import styles from './MenuBar.module.css'

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
const modKey = isMac ? '⌘' : 'Ctrl'

function handleNew() {
  const { isDirty } = useProjectStore.getState()
  if (isDirty && !window.confirm('Discard unsaved changes and start a new layout?')) return
  useProjectStore.getState().resetProject()
  useHistoryStore.getState().clear()
}

function handleOpen() {
  const { isDirty } = useProjectStore.getState()
  if (isDirty && !window.confirm('Discard unsaved changes and open a different file?')) return
  openProjectFile()
    .then((project) => {
      useProjectStore.getState().setProject(project)
      useHistoryStore.getState().clear()
    })
    .catch((e) => {
      if (e instanceof LoadError) window.alert(e.message)
    })
}

function handleSave() {
  const { project } = useProjectStore.getState()
  downloadProject(project)
  useProjectStore.getState().markSaved()
}

function handleExportPng() {
  const stage = getStage()
  if (!stage) {
    window.alert('Canvas is not ready yet. Please try again in a moment.')
    return
  }
  exportStageToPng(stage)
}

function handleUndo() {
  const { project } = useProjectStore.getState()
  const previous = useHistoryStore.getState().undo(project)
  if (previous) useProjectStore.getState().applySnapshot(previous)
}

function handleRedo() {
  const { project } = useProjectStore.getState()
  const next = useHistoryStore.getState().redo(project)
  if (next) useProjectStore.getState().applySnapshot(next)
}

function handleSelectAll() {
  const { lockedLayers, setSelection } = useUIStore.getState()
  const { project } = useProjectStore.getState()
  const ids = [
    ...(lockedLayers.rooms ? [] : project.rooms.map((r) => r.id)),
    ...(lockedLayers.furniture ? [] : project.furnitureInstances.map((f) => f.id)),
    ...(lockedLayers.annotations ? [] : project.annotations.map((a) => a.id)),
  ]
  setSelection(ids)
}

function handleDeleteSelected() {
  const { selectedIds, clearSelection } = useUIStore.getState()
  if (selectedIds.length === 0) return
  const { project, removeEntities } = useProjectStore.getState()
  useHistoryStore.getState().pushSnapshot(project)
  removeEntities(selectedIds)
  clearSelection()
}

interface MenuEntry {
  label: string
  shortcut?: string
  disabled?: boolean
  checked?: boolean
  onSelect?: () => void
}

type MenuSpec = { label: string; entries: (MenuEntry | 'separator')[] }

interface MenuState {
  showGrid: boolean
  snapToGrid: boolean
  view: { x: number; y: number; scale: number }
  hasSelection: boolean
  canUndo: boolean
  canRedo: boolean
}

function buildMenus({ showGrid, snapToGrid, view, hasSelection, canUndo, canRedo }: MenuState): MenuSpec[] {
  return [
    {
      label: 'File',
      entries: [
        { label: 'New Layout', onSelect: handleNew },
        { label: 'Open...', onSelect: handleOpen },
        'separator',
        { label: 'Save', shortcut: `${modKey}+S`, onSelect: handleSave },
        'separator',
        { label: 'Import Reference Image...', onSelect: startImageImport },
        'separator',
        { label: 'Export as PNG', onSelect: handleExportPng },
        { label: 'Export as SVG', disabled: true },
      ],
    },
    {
      label: 'Edit',
      entries: [
        { label: 'Undo', shortcut: `${modKey}+Z`, disabled: !canUndo, onSelect: handleUndo },
        { label: 'Redo', shortcut: `${modKey}+Shift+Z`, disabled: !canRedo, onSelect: handleRedo },
        'separator',
        {
          label: 'Delete Selected',
          shortcut: 'Del',
          disabled: !hasSelection,
          onSelect: handleDeleteSelected,
        },
        { label: 'Select All', shortcut: `${modKey}+A`, onSelect: handleSelectAll },
        {
          label: 'Deselect',
          disabled: !hasSelection,
          onSelect: () => useUIStore.getState().clearSelection(),
        },
      ],
    },
    {
      label: 'View',
      entries: [
        {
          label: 'Zoom In',
          shortcut: `${modKey}+=`,
          onSelect: () => useUIStore.getState().setView({ ...view, scale: Math.min(10, view.scale * 1.2) }),
        },
        {
          label: 'Zoom Out',
          shortcut: `${modKey}+-`,
          onSelect: () => useUIStore.getState().setView({ ...view, scale: Math.max(0.1, view.scale / 1.2) }),
        },
        {
          label: 'Reset Zoom',
          shortcut: `${modKey}+0`,
          onSelect: () => useUIStore.getState().setView({ x: 0, y: 0, scale: 1 }),
        },
        'separator',
        {
          label: 'Show Grid',
          checked: showGrid,
          onSelect: () => useUIStore.getState().toggleGrid(),
        },
        {
          label: 'Snap to Grid',
          checked: snapToGrid,
          onSelect: () => useProjectStore.getState().toggleSnapToGrid(),
        },
      ],
    },
  ]
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const showGrid = useUIStore((s) => s.showGrid)
  const view = useUIStore((s) => s.view)
  const hasSelection = useUIStore((s) => s.selectedIds.length > 0)
  const snapToGrid = useProjectStore((s) => s.project.settings.snapToGrid)
  const canUndo = useHistoryStore((s) => s.past.length > 0)
  const canRedo = useHistoryStore((s) => s.future.length > 0)

  const menus = useMemo(
    () => buildMenus({ showGrid, snapToGrid, view, hasSelection, canUndo, canRedo }),
    [showGrid, snapToGrid, view, hasSelection, canUndo, canRedo],
  )

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        setOpenMenu(null)
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (!mod) {
        if (e.key === 'Delete') handleDeleteSelected()
        return
      }
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        handleRedo()
      } else if (key === 's') {
        e.preventDefault()
        handleSave()
      } else if (key === 'a') {
        e.preventDefault()
        handleSelectAll()
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
                    {entry.shortcut && <span className={styles.shortcut}>{entry.shortcut}</span>}
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
