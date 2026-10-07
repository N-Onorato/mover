import { useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { MenuBar } from './components/MenuBar'
import { Toolbar } from './components/Toolbar'
import { CatalogPanel } from './components/CatalogPanel'
import { LayerPanel } from './components/LayerPanel'
import { PropertiesPanel } from './components/PropertiesPanel'
import { StatusBar } from './components/StatusBar'
import { SettingsPanel } from './components/SettingsPanel'
import { CalibrationLengthDialog } from './components/CalibrationLengthDialog'
import { MobileDrawer } from './components/MobileDrawer'
import { ShortcutSheet } from './components/ShortcutSheet'
import { LayoutWorkspace } from './canvas/LayoutWorkspace'
import { useProjectStore } from './store/projectStore'
import { useLibraryStore } from './store/libraryStore'
import { useMediaQuery } from './hooks/useMediaQuery'
import { isCoarsePointer } from './utils/pointer'
import { isTypingTarget, matchesShortcut } from './keyboard/shortcuts'
import { loadFromLocalStorage } from './io/load'
import { saveToLocalStorage } from './io/save'
import { embedLibrary } from './furniture/library'
import styles from './App.module.css'
import resizeStyles from './components/ResizeHandle.module.css'

const AUTOSAVE_DEBOUNCE_MS = 1000

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false)
  const [panelsDrawerOpen, setPanelsDrawerOpen] = useState(false)
  // Narrow screens can't fit the three-column resizable layout - the side
  // panels move into overlay drawers and the canvas takes the full width.
  const isNarrow = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    // Library first: it is the source of truth on id collisions, so it has to
    // be in place before a restored project's own copy is merged in.
    useLibraryStore.getState().hydrate()
    const restored = loadFromLocalStorage()
    if (restored) {
      useProjectStore.getState().setProject(restored)
      useLibraryStore.getState().mergeFromProject(restored)
    }
  }, [])

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return useProjectStore.subscribe((state) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(
        // The library is embedded at the save boundary rather than kept in
        // the project, so editing sets never marks the project dirty.
        () => saveToLocalStorage(embedLibrary(state.project, useLibraryStore.getState().library)),
        AUTOSAVE_DEBOUNCE_MS,
      )
    })
  }, [])

  // I5 (#24): `?` opens the shortcut cheat sheet. Touch-first devices have
  // no physical keyboard to use shortcuts with, so they get neither the
  // binding nor the Help menu entry. Closing is the sheet's own job: while
  // it's open it captures `?`/Escape before this listener ever sees them.
  useEffect(() => {
    if (isCoarsePointer) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || isTypingTarget(e.target) || !matchesShortcut(e, 'help.shortcuts')) return
      e.preventDefault()
      setShortcutsOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const workspaceLayout = useDefaultLayout({ id: 'mover-workspace-layout', storage: localStorage })
  const sidebarLayout = useDefaultLayout({ id: 'mover-right-sidebar', storage: localStorage })

  return (
    <div className={styles.app}>
      <MenuBar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={isCoarsePointer ? undefined : () => setShortcutsOpen(true)}
      />
      <Toolbar
        onToggleCatalog={isNarrow ? () => setCatalogDrawerOpen((o) => !o) : undefined}
        onTogglePanels={isNarrow ? () => setPanelsDrawerOpen((o) => !o) : undefined}
      />
      {isNarrow ? (
        <div className={styles.workspace}>
          <LayoutWorkspace />
        </div>
      ) : (
        <div className={styles.workspace}>
          <Group orientation="horizontal" {...workspaceLayout}>
            <Panel id="catalog" defaultSize="20%" minSize="12%">
              <CatalogPanel />
            </Panel>
            <Separator className={resizeStyles.handle} />
            <Panel id="canvas" minSize="30%">
              <LayoutWorkspace />
            </Panel>
            <Separator className={resizeStyles.handle} />
            <Panel id="sidebar" defaultSize="22%" minSize="14%">
              <Group orientation="vertical" {...sidebarLayout}>
                <Panel id="layers" minSize="15%">
                  <LayerPanel />
                </Panel>
                <Separator className={resizeStyles.handleHorizontal} />
                <Panel id="properties" minSize="15%">
                  <PropertiesPanel />
                </Panel>
              </Group>
            </Panel>
          </Group>
        </div>
      )}
      {isNarrow && catalogDrawerOpen && (
        <MobileDrawer side="left" onClose={() => setCatalogDrawerOpen(false)}>
          <CatalogPanel onItemChosen={() => setCatalogDrawerOpen(false)} />
        </MobileDrawer>
      )}
      {isNarrow && panelsDrawerOpen && (
        <MobileDrawer side="right" onClose={() => setPanelsDrawerOpen(false)}>
          <LayerPanel />
          <PropertiesPanel />
        </MobileDrawer>
      )}
      <StatusBar />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      <CalibrationLengthDialog />
      {!isCoarsePointer && (
        <ShortcutSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      )}
    </div>
  )
}
