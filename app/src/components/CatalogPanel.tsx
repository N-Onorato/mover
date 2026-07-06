import { useState } from 'react'
import catalog from '../furniture/catalog'
import type { FurnitureDefinition } from '../types/project'
import styles from './CatalogPanel.module.css'

export function CatalogPanel() {
  const [query, setQuery] = useState('')

  const filtered = query
    ? catalog.filter(
        (d) =>
          d.name.toLowerCase().includes(query.toLowerCase()) ||
          d.tags.some((t) => t.includes(query.toLowerCase())),
      )
    : catalog

  function handleDragStart(e: React.DragEvent, def: FurnitureDefinition) {
    e.dataTransfer.setData('application/mover-furniture', def.id)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Catalog</div>
      <input
        className={styles.search}
        placeholder="Search furniture..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={styles.list}>
        {filtered.map((def) => (
          <div
            key={def.id}
            className={styles.item}
            draggable
            onDragStart={(e) => handleDragStart(e, def)}
          >
            <div className={styles.itemName}>{def.name}</div>
            <div className={styles.itemSize}>
              {def.width}" x {def.depth}"
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
