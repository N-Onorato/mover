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
  onPointerDown(worldPt: Point, _ppu: number, _modifiers) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState || drawingState.kind !== 'calibration') return
    const pts = [...drawingState.points, worldPt]
    if (pts.length >= 2) {
      finishCalibration(drawingState.imageId, [pts[0], pts[1]])
      return
    }
    setDrawingState({ ...drawingState, points: pts, cursor: worldPt })
  },
  onPointerMove(worldPt: Point, _ppu: number, _modifiers) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState || drawingState.kind !== 'calibration') return
    setDrawingState({ ...drawingState, cursor: worldPt })
  },
  onPointerUp(_worldPt, _ppu, _modifiers) {},
  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') cancelCalibration()
  },
  onRightClick() {
    cancelCalibration()
  },
  // B1/F4: calibration needs raw (unsnapped) coordinates so its endpoints can
  // land on the reference photo's real features rather than grid intersections.
  wantsRawPointer() {
    return useUIStore.getState().drawingState?.kind === 'calibration'
  },
}
