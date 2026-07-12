import { useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { MenuBar } from './components/MenuBar'
import { Toolbar } from './components/Toolbar'
import { CatalogPanel } from './components/CatalogPanel'
import { LayerPanel } from './components/LayerPanel'
import { PropertiesPanel } from './components/PropertiesPanel'
import { StatusBar } from './components/StatusBar'
import { SettingsPanel } from './components/SettingsPanel'
import { MobileDrawer } from './components/MobileDrawer'
import { LayoutCanvas } from './canvas/LayoutCanvas'
import { useProjectStore } from './store/projectStore'
import { useMediaQuery } from './hooks/useMediaQuery'
import { loadFromLocalStorage } from './io/load'
import { saveToLocalStorage } from './io/save'
import styles from './App.module.css'
import resizeStyles from './components/ResizeHandle.module.css'

const AUTOSAVE_DEBOUNCE_MS = 1000

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false)
  const [panelsDrawerOpen, setPanelsDrawerOpen] = useState(false)
  // Narrow screens can't fit the three-column resizable layout - the side
  // panels move into overlay drawers and the canvas takes the full width.
  const isNarrow = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    const restored = loadFromLocalStorage()
    if (restored) useProjectStore.getState().setProject(restored)
  }, [])

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return useProjectStore.subscribe((state) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => saveToLocalStorage(state.project), AUTOSAVE_DEBOUNCE_MS)
    })
  }, [])

  const workspaceLayout = useDefaultLayout({ id: 'mover-workspace-layout', storage: localStorage })
  const sidebarLayout = useDefaultLayout({ id: 'mover-right-sidebar', storage: localStorage })

  return (
    <div className={styles.app}>
      <MenuBar onOpenSettings={() => setSettingsOpen(true)} />
      <Toolbar
        onToggleCatalog={isNarrow ? () => setCatalogDrawerOpen((o) => !o) : undefined}
        onTogglePanels={isNarrow ? () => setPanelsDrawerOpen((o) => !o) : undefined}
      />
      {isNarrow ? (
        <div className={styles.workspace}>
          <LayoutCanvas />
        </div>
      ) : (
        <div className={styles.workspace}>
          <Group orientation="horizontal" {...workspaceLayout}>
            <Panel id="catalog" defaultSize="20%" minSize="12%">
              <CatalogPanel />
            </Panel>
            <Separator className={resizeStyles.handle} />
            <Panel id="canvas" minSize="30%">
              <LayoutCanvas />
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
    </div>
  )
}
