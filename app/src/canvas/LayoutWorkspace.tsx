import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../store/uiStore'
import { activateFurnitureLayout } from '../project/layoutActions'
import { activeFurnitureLayout } from '../project/layouts'
import { LayoutTabs } from '../components/LayoutTabs'
import { LayoutCanvas } from './LayoutCanvas'
import { ComparisonPane } from './ComparisonPane'
import styles from './LayoutWorkspace.module.css'

/** L1 (#28): the canvas column - the layout tab strip, and below it either
 * the single editable canvas or the side-by-side comparison.
 *
 * In compare mode the active layout keeps the real `LayoutCanvas` (tools,
 * selection, drag, rulers) and the others get read-only `ComparisonPane`s;
 * clicking one hands the editable canvas over to it. See ComparisonPane for
 * why only one pane is live at a time.
 */
export function LayoutWorkspace() {
  const layouts = useProjectStore((s) => s.project.furnitureLayouts)
  const activeId = useProjectStore((s) => activeFurnitureLayout(s.project)?.id)
  const compareMode = useUIStore((s) => s.compareMode)
  const comparedLayoutIds = useUIStore((s) => s.comparedLayoutIds)

  // Panes follow tab order, so the leftmost pane is the leftmost tab. The
  // active layout is always included: it's the one being edited.
  const panes = layouts.filter((l) => l.id === activeId || comparedLayoutIds.includes(l.id))

  return (
    <div className={styles.workspace}>
      <LayoutTabs />
      {compareMode ? (
        <div className={styles.compareRow}>
          {panes.map((layout) => {
            const isActive = layout.id === activeId
            return (
              <div
                key={layout.id}
                className={`${styles.pane} ${isActive ? styles.paneActive : ''}`}
                // Inactive panes are a click target for switching; the active
                // one must not intercept clicks meant for its tools.
                {...(isActive
                  ? {}
                  : {
                      role: 'button' as const,
                      tabIndex: 0,
                      'aria-label': `Edit ${layout.name}`,
                      onClick: () => activateFurnitureLayout(layout.id),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          activateFurnitureLayout(layout.id)
                        }
                      },
                    })}
              >
                <div className={styles.paneHeader}>
                  <span className={styles.paneName}>{layout.name}</span>
                  <span className={styles.paneBadge}>
                    {isActive ? 'Editing' : 'Click to edit'}
                  </span>
                </div>
                <div className={styles.paneBody}>
                  {isActive ? <LayoutCanvas /> : <ComparisonPane layoutId={layout.id} />}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={styles.single}>
          <LayoutCanvas />
        </div>
      )}
    </div>
  )
}
