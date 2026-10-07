import { useProjectStore } from '../store/projectStore'
import { useLibraryStore } from '../store/libraryStore'
import { useUIStore, DEFAULT_VIEW } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import { downloadProject } from '../io/save'
import { openProjectFile, LoadError } from '../io/load'
import { embedLibrary } from '../furniture/library'
import { exportStageToPng } from '../io/exportPng'
import { getStage } from '../canvas/stageRegistry'
import { startImageImport } from '../canvas/tools/ImageTool'
import { activeFurnitureInstances } from '../project/layouts'
import type { ShortcutId } from '../keyboard/shortcuts'

/** The menu bar's contents and actions, kept apart from the MenuBar
 * component so tests can check every menu shortcut against the registry
 * (keyboard/shortcuts.test.ts). */

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
      // Pieces saved inside the file join this browser's library; entries it
      // already has win, so re-opening a file can't duplicate a set.
      useLibraryStore.getState().mergeFromProject(project)
      useHistoryStore.getState().clear()
    })
    .catch((e) => {
      if (e instanceof LoadError) window.alert(e.message)
    })
}

function handleSave() {
  const { project } = useProjectStore.getState()
  // The saved file carries a copy of the furniture library so the sets travel
  // with it; see furniture/library.ts.
  downloadProject(embedLibrary(project, useLibraryStore.getState().library))
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

// A restored snapshot may not contain what was selected - the entities may
// have been deleted, or (L1) belong to a furniture layout that isn't the
// restored active one. Dropping the selection keeps the properties panel and
// the delete action pointed only at what is actually on the canvas.
function handleUndo() {
  const { project } = useProjectStore.getState()
  const previous = useHistoryStore.getState().undo(project)
  if (!previous) return
  useUIStore.getState().clearSelection()
  useProjectStore.getState().applySnapshot(previous)
}

function handleRedo() {
  const { project } = useProjectStore.getState()
  const next = useHistoryStore.getState().redo(project)
  if (!next) return
  useUIStore.getState().clearSelection()
  useProjectStore.getState().applySnapshot(next)
}

function handleSelectAll() {
  const { lockedLayers, setSelection } = useUIStore.getState()
  const { project } = useProjectStore.getState()
  const ids = [
    ...(lockedLayers.rooms ? [] : project.rooms.map((r) => r.id)),
    ...(lockedLayers.furniture ? [] : activeFurnitureInstances(project).map((f) => f.id)),
    ...(lockedLayers.annotations ? [] : project.annotations.map((a) => a.id)),
    ...(lockedLayers.referenceImages ? [] : project.referenceImages.map((img) => img.id)),
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

export interface MenuEntry {
  label: string
  /** I5 (#24): both the label shown next to the entry and the key that
   * triggers it come from this one registry id, so they can't drift apart. */
  shortcutId?: ShortcutId
  disabled?: boolean
  checked?: boolean
  onSelect?: () => void
}

export type MenuSpec = { label: string; entries: (MenuEntry | 'separator')[] }

export interface MenuState {
  showGrid: boolean
  snapToGrid: boolean
  units: 'imperial' | 'metric'
  rulerMode: 'feet-inches' | 'simple'
  view: { x: number; y: number; scale: number }
  hasSelection: boolean
  canUndo: boolean
  canRedo: boolean
  onOpenSettings?: () => void
  onOpenShortcuts?: () => void
}

export function buildMenus({
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
}: MenuState): MenuSpec[] {
  const menus: MenuSpec[] = [
    {
      label: 'File',
      entries: [
        { label: 'New Layout', onSelect: handleNew },
        { label: 'Open...', onSelect: handleOpen },
        'separator',
        { label: 'Save', shortcutId: 'save', onSelect: handleSave },
        'separator',
        { label: 'Import Reference Image...', onSelect: startImageImport },
        'separator',
        { label: 'Export as PNG', onSelect: handleExportPng },
        { label: 'Export as SVG', disabled: true },
        'separator',
        { label: 'Project Settings...', onSelect: onOpenSettings },
      ],
    },
    {
      label: 'Edit',
      entries: [
        { label: 'Undo', shortcutId: 'undo', disabled: !canUndo, onSelect: handleUndo },
        { label: 'Redo', shortcutId: 'redo', disabled: !canRedo, onSelect: handleRedo },
        'separator',
        {
          label: 'Delete Selected',
          shortcutId: 'deleteSelected',
          disabled: !hasSelection,
          onSelect: handleDeleteSelected,
        },
        { label: 'Select All', shortcutId: 'selectAll', onSelect: handleSelectAll },
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
          shortcutId: 'zoomIn',
          onSelect: () => useUIStore.getState().setView({ ...view, scale: Math.min(10, view.scale * 1.2) }),
        },
        {
          label: 'Zoom Out',
          shortcutId: 'zoomOut',
          onSelect: () => useUIStore.getState().setView({ ...view, scale: Math.max(0.1, view.scale / 1.2) }),
        },
        {
          label: 'Reset Zoom',
          shortcutId: 'resetZoom',
          onSelect: () => useUIStore.getState().setView(DEFAULT_VIEW),
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
          onSelect: () => {
            useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
            useProjectStore.getState().toggleSnapToGrid()
          },
        },
        {
          label: 'Feet/Inch Ruler',
          checked: rulerMode === 'feet-inches',
          disabled: units === 'metric',
          onSelect: () => useProjectStore.getState().toggleRulerMode(),
        },
      ],
    },
  ]
  // Touch-first layouts get no cheat sheet (#24), so App leaves this unset.
  if (onOpenShortcuts) {
    menus.push({
      label: 'Help',
      entries: [{ label: 'Keyboard Shortcuts', shortcutId: 'help.shortcuts', onSelect: onOpenShortcuts }],
    })
  }
  return menus
}
