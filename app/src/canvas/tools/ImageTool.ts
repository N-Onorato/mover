import type { ToolHandlers } from './SelectTool'
import type { Point } from '../../types/project'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { useHistoryStore } from '../../store/historyStore'
import { distance } from '../../utils/geometry'
import { parseLength } from '../../utils/units'
import { openImageFile, ImageLoadError } from '../../io/loadImage'

const DEFAULT_WIDTH_WORLD_UNITS = 96 // ~8ft at default (uncalibrated) scale

export function startImageImport() {
  openImageFile()
    .then(({ dataUrl, width, height }) => {
      const aspect = height / width
      const defaultWidth = DEFAULT_WIDTH_WORLD_UNITS
      const defaultHeight = defaultWidth * aspect
      const image = {
        id: crypto.randomUUID(),
        name: 'Reference Image',
        src: dataUrl,
        x: 0,
        y: 0,
        width: defaultWidth,
        height: defaultHeight,
        rotation: 0,
        opacity: 0.6,
        locked: false,
        visible: true,
        calibration: null,
      }
      useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
      useProjectStore.getState().addReferenceImage(image)
      useUIStore.getState().setActiveTool('image')
      // G4: origin placement runs before calibration — the user first says
      // where the image's outer top-left corner lands in world space, then
      // (once that's confirmed) calibration sets the scale. Composing them
      // this way means calibration's own point-picking always operates on an
      // image that's already positioned where the user expects it.
      startImageOrigin(image.id)
    })
    .catch((e) => {
      if (e instanceof ImageLoadError) window.alert(e.message)
    })
}

function cancelCalibration() {
  useUIStore.getState().setDrawingState(null)
  useUIStore.getState().setActiveTool('select')
}

function startImageOrigin(imageId: string) {
  useUIStore.getState().setDrawingState({
    kind: 'imageOrigin',
    imageId,
    cursor: null,
  })
}

// G4: cancelling origin placement leaves the image at its default x:0, y:0
// (set in startImageImport) — mirrors cancelCalibration's cancel behavior.
function cancelImageOrigin() {
  useUIStore.getState().setDrawingState(null)
  useUIStore.getState().setActiveTool('select')
}

function finishImageOrigin(imageId: string, worldPt: Point) {
  const { project, updateReferenceImage } = useProjectStore.getState()
  const image = project.referenceImages.find((r) => r.id === imageId)
  if (image) {
    useHistoryStore.getState().pushSnapshot(project)
    updateReferenceImage(imageId, { x: worldPt.x, y: worldPt.y })
  }
  // Origin placement is done; hand off to calibration for the same image.
  useUIStore.getState().setDrawingState({
    kind: 'calibration',
    imageId,
    points: [],
    cursor: null,
  })
}

function finishCalibration(imageId: string, points: [Point, Point]) {
  const worldDist = distance(points[0], points[1])
  if (worldDist <= 0) {
    cancelCalibration()
    return
  }
  const units = useProjectStore.getState().project.settings.units
  let promptMessage = 'Enter the real-world length of this line:'
  let realLength: number | null = null
  while (realLength === null) {
    const input = window.prompt(promptMessage, '')
    if (input === null) break
    const result = parseLength(input, units)
    if (result.ok) {
      realLength = result.value
    } else {
      promptMessage = `${result.error}\nEnter the real-world length of this line:`
    }
  }
  if (realLength !== null) {
    const { project, updateReferenceImage } = useProjectStore.getState()
    const image = project.referenceImages.find((r) => r.id === imageId)
    if (image) {
      useHistoryStore.getState().pushSnapshot(project)
      const scale = realLength / worldDist
      updateReferenceImage(imageId, {
        width: image.width * scale,
        height: image.height * scale,
        calibration: { p1: points[0], p2: points[1], realWorldDistance: realLength },
      })
    }
  }
  cancelCalibration()
}

export const ImageTool: ToolHandlers = {
  onPointerDown(worldPt: Point, _rawWorldPt: Point, _ppu: number, _modifiers) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState) return
    if (drawingState.kind === 'imageOrigin') {
      finishImageOrigin(drawingState.imageId, worldPt)
      return
    }
    if (drawingState.kind !== 'calibration') return
    const pts = [...drawingState.points, worldPt]
    if (pts.length >= 2) {
      finishCalibration(drawingState.imageId, [pts[0], pts[1]])
      return
    }
    setDrawingState({ ...drawingState, points: pts, cursor: worldPt })
  },
  onPointerMove(worldPt: Point, _ppu: number, _modifiers) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState) return
    if (drawingState.kind === 'imageOrigin' || drawingState.kind === 'calibration') {
      setDrawingState({ ...drawingState, cursor: worldPt })
    }
  },
  onPointerUp(_worldPt, _ppu, _modifiers) {},
  onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    const kind = useUIStore.getState().drawingState?.kind
    if (kind === 'imageOrigin') cancelImageOrigin()
    else if (kind === 'calibration') cancelCalibration()
  },
  onRightClick() {
    const kind = useUIStore.getState().drawingState?.kind
    if (kind === 'imageOrigin') cancelImageOrigin()
    else if (kind === 'calibration') cancelCalibration()
  },
  // A pinch started mid-calibration: the first finger added a stray
  // calibration point - pop it so the user can zoom in for precision and
  // re-pick. (imageOrigin commits on pointer-down and hands off to
  // calibration with zero points, so there's nothing to pop there; the
  // placed origin stays undoable.)
  onGestureCancel() {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (drawingState?.kind === 'calibration' && drawingState.points.length > 0) {
      setDrawingState({ ...drawingState, points: drawingState.points.slice(0, -1) })
    }
  },
  // B1/F4: calibration and origin placement both need raw (unsnapped)
  // coordinates — calibration's endpoints must land on the reference photo's
  // real features rather than grid intersections, and origin placement
  // should be equally precise rather than snapping the image to the grid.
  wantsRawPointer() {
    const kind = useUIStore.getState().drawingState?.kind
    return kind === 'calibration' || kind === 'imageOrigin'
  },
}
