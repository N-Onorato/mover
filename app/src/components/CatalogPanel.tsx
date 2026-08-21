import { useState } from 'react'
import catalog from '../furniture/catalog'
import { useUIStore } from '../store/uiStore'
import { PlaceableItem } from './PlaceableItem'
import { SetsTab } from './SetsTab'
import styles from './CatalogPanel.module.css'

interface Props {
  /** Called after an item is armed for tap-to-place. The narrow-screen layout
   * uses this to close the catalog drawer so the canvas is tappable. */
  onItemChosen?: () => void
}

const TABS = [
  { id: 'catalog', label: 'Catalog' },
  { id: 'sets', label: 'Sets' },
] as const

export function CatalogPanel({ onItemChosen }: Props = {}) {
  // Shared across tabs on purpose: typing "sofa" and flipping tabs means
  // "show me sofas here too".
  const [query, setQuery] = useState('')
  const tab = useUIStore((s) => s.catalogTab)
  const setTab = useUIStore((s) => s.setCatalogTab)

  const filtered = query
    ? catalog.filter(
        (d) =>
          d.name.toLowerCase().includes(query.toLowerCase()) ||
          d.tags.some((t) => t.includes(query.toLowerCase())),
      )
    : catalog

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Catalog</div>
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`${styles.tab} ${tab === t.id ? styles.active : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input
        className={styles.search}
        placeholder={tab === 'catalog' ? 'Search furniture...' : 'Search saved pieces...'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {tab === 'catalog' ? (
        <div className={styles.list}>
          {filtered.map((def) => (
            <PlaceableItem key={def.id} def={def} onChosen={onItemChosen} />
          ))}
        </div>
      ) : (
        <SetsTab query={query} onItemChosen={onItemChosen} />
      )}
    </div>
  )
}
