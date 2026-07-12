import type { ToolHandlers } from './SelectTool'
import type { Point } from '../../types/project'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { useHistoryStore } from '../../store/historyStore'
import { distance } from '../../utils/geometry'
import { isDoubleClick } from '../../utils/doubleClick'
import { ROOM_CLOSE_THRESHOLD_PX } from '../../utils/pointer'

let lastClickMs = 0

function commitRoom(points: Point[]) {
  if (points.length < 3) return
  const { project } = useProjectStore.getState()
  useHistoryStore.getState().pushSnapshot(project)
  useProjectStore.getState().addRoom({
    id: crypto.randomUUID(),
    name: '',
    points,
    wallThickness: project.settings.defaultWallThickness,
    fillColor: 'rgba(220,230,245,0.4)',
    wallColor: '#334',
    locked: false,
    visible: true,
  })
  useUIStore.getState().setDrawingState(null)
}

export const RoomTool: ToolHandlers = {
  onPointerDown(worldPt: Point, ppu: number, _modifiers) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    const now = Date.now()

    if (!drawingState || drawingState.kind !== 'room') {
      setDrawingState({ kind: 'room', points: [worldPt], cursor: worldPt })
      lastClickMs = now
      return
    }

    const pts = drawingState.points

    // Double-click: close if we have enough points
    if (isDoubleClick(lastClickMs, now) && pts.length >= 3) {
      commitRoom(pts)
      lastClickMs = 0
      return
    }
    lastClickMs = now

    // Click near first point: close polygon
    const thresholdWorld = ROOM_CLOSE_THRESHOLD_PX / ppu
    if (pts.length >= 3 && distance(worldPt, pts[0]) <= thresholdWorld) {
      commitRoom(pts)
      return
    }

    setDrawingState({ ...drawingState, points: [...pts, worldPt], cursor: worldPt })
  },

  onPointerMove(worldPt: Point, _ppu: number, _modifiers) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState || drawingState.kind !== 'room') return
    setDrawingState({ ...drawingState, cursor: worldPt })
  },

  onPointerUp(_worldPt: Point, _ppu: number, _modifiers) {},

  onKeyDown(e: KeyboardEvent) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState) return

    if (e.key === 'Escape') {
      setDrawingState(null)
      return
    }
    if (e.key === 'Enter' && drawingState.kind === 'room' && drawingState.points.length >= 3) {
      commitRoom(drawingState.points)
      return
    }
    if (e.key === 'Backspace' && drawingState.kind === 'room' && drawingState.points.length > 1) {
      e.preventDefault()
      setDrawingState({ ...drawingState, points: drawingState.points.slice(0, -1) })
    }
  },

  onRightClick() {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState) return
    // Right-click closes the polygon if possible, otherwise cancels
    if (drawingState.kind === 'room' && drawingState.points.length >= 3) {
      commitRoom(drawingState.points)
    } else {
      setDrawingState(null)
    }
  },

  // A pinch started while drawing: the first finger's pointer-down added a
  // stray point - pop it (or drop the drawing entirely if that stray point
  // was the first one).
  onGestureCancel() {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState || drawingState.kind !== 'room') return
    if (drawingState.points.length <= 1) {
      setDrawingState(null)
    } else {
      setDrawingState({ ...drawingState, points: drawingState.points.slice(0, -1) })
    }
  },
}
