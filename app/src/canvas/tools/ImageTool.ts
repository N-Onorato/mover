import type { ToolHandlers } from './SelectTool'
import type { Point } from '../../types/project'
import { useUIStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { distance } from '../../utils/geometry'
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
      useProjectStore.getState().addReferenceImage(image)
      useUIStore.getState().setActiveTool('image')
      useUIStore.getState().setDrawingState({
        kind: 'calibration',
        imageId: image.id,
        points: [],
        cursor: null,
      })
    })
    .catch((e) => {
      if (e instanceof ImageLoadError) window.alert(e.message)
    })
}

function cancelCalibration() {
  useUIStore.getState().setDrawingState(null)
  useUIStore.getState().setActiveTool('select')
}

function finishCalibration(imageId: string, points: [Point, Point]) {
  const worldDist = distance(points[0], points[1])
  if (worldDist <= 0) {
    cancelCalibration()
    return
  }
  const input = window.prompt('Enter the real-world length of this line (in inches):', '')
  const realLength = input ? parseFloat(input) : NaN
  if (Number.isFinite(realLength) && realLength > 0) {
    const { project, updateReferenceImage } = useProjectStore.getState()
    const image = project.referenceImages.find((r) => r.id === imageId)
    if (image) {
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
  onPointerDown(worldPt: Point, _ppu: number) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState || drawingState.kind !== 'calibration') return
    const pts = [...drawingState.points, worldPt]
    if (pts.length >= 2) {
      finishCalibration(drawingState.imageId, [pts[0], pts[1]])
      return
    }
    setDrawingState({ ...drawingState, points: pts, cursor: worldPt })
  },
  onPointerMove(worldPt: Point, _ppu: number) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState || drawingState.kind !== 'calibration') return
    setDrawingState({ ...drawingState, cursor: worldPt })
  },
  onPointerUp(_worldPt, _ppu) {},
  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') cancelCalibration()
  },
  onRightClick() {
    cancelCalibration()
  },
}
