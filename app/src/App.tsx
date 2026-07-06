import { useEffect, useRef } from 'react'
import { MenuBar } from './components/MenuBar'
import { Toolbar } from './components/Toolbar'
import { CatalogPanel } from './components/CatalogPanel'
import { LayerPanel } from './components/LayerPanel'
import { PropertiesPanel } from './components/PropertiesPanel'
import { LayoutCanvas } from './canvas/LayoutCanvas'
import { useProjectStore } from './store/projectStore'
import { loadFromLocalStorage } from './io/load'
import { saveToLocalStorage } from './io/save'
import styles from './App.module.css'

const AUTOSAVE_DEBOUNCE_MS = 1000

export default function App() {
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

  return (
    <div className={styles.app}>
      <MenuBar />
      <Toolbar />
      <div className={styles.workspace}>
        <CatalogPanel />
        <LayoutCanvas />
        <div className={styles.rightPanels}>
          <LayerPanel />
          <PropertiesPanel />
        </div>
      </div>
    </div>
  )
}
