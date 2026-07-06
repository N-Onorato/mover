import { MenuBar } from './components/MenuBar'
import { Toolbar } from './components/Toolbar'
import { CatalogPanel } from './components/CatalogPanel'
import { LayerPanel } from './components/LayerPanel'
import { PropertiesPanel } from './components/PropertiesPanel'
import { LayoutCanvas } from './canvas/LayoutCanvas'
import styles from './App.module.css'

export default function App() {
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
