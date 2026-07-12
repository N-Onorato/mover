import { useMemo } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUIStore, TOOL_LABELS, getToolHint } from '../store/uiStore'
import { findDefinition } from '../furniture/catalog'
import { polygonArea } from '../utils/geometry'
import { formatArea } from '../utils/units'
import styles from './StatusBar.module.css'

export function StatusBar() {
  const activeTool = useUIStore((s) => s.activeTool)
  const drawingState = useUIStore((s) => s.drawingState)
  const pendingPlacementDefId = useUIStore((s) => s.pendingPlacementDefId)
  const rooms = useProjectStore((s) => s.project.rooms)
  const units = useProjectStore((s) => s.project.settings.units)

  const pendingName = pendingPlacementDefId
    ? (findDefinition(pendingPlacementDefId)?.name ?? null)
    : null
  const hint = getToolHint(activeTool, drawingState, pendingName)
  const toolLabel = TOOL_LABELS[activeTool]

  const totalArea = useMemo(
    () => rooms.reduce((sum, room) => sum + polygonArea(room.points), 0),
    [rooms],
  )

  return (
    <div className={styles.statusBar}>
      <span className={styles.tool}>
        <strong>{toolLabel}</strong>
        {hint !== toolLabel && <span className={styles.hint}>{hint}</span>}
      </span>
      <span className={styles.spacer} />
      <span className={styles.area}>
        Total area: {formatArea(totalArea, units)} ({rooms.length} room{rooms.length === 1 ? '' : 's'})
      </span>
    </div>
  )
}
