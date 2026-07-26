import { describe, expect, it, beforeEach } from 'vitest'
import {
  ImageTool,
  applyCalibrationLength,
  beginImageImport,
  calibrationPatch,
  cancelImageFlow,
  redoCalibrationLine,
  resizeImagePatch,
  startRecalibration,
} from './ImageTool'
import { useUIStore, getImageFlowStep } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { useHistoryStore } from '../../store/historyStore'
import { distance } from '../../utils/geometry'
import type { ReferenceImage } from '../../types/project'

const NO_MODIFIERS = { shift: false, ctrl: false }

function makeReferenceImage(patch: Partial<ReferenceImage> = {}): ReferenceImage {
  return {
    id: 'img-1',
    name: 'Reference Image',
    src: '',
    x: 0,
    y: 0,
    width: 20,
    height: 10,
    rotation: 0,
    opacity: 0.6,
    locked: false,
    visible: true,
    calibration: null,
    ...patch,
  }
}

function resetStores() {
  useUIStore.setState({ activeTool: 'select', selectedIds: [], drawingState: null })
  useProjectStore.setState((s) => ({
    project: { ...s.project, referenceImages: [] },
  }))
  useHistoryStore.setState({ past: [], future: [] })
}

function click(pt: { x: number; y: number }) {
  ImageTool.onPointerDown(pt, pt, 10, NO_MODIFIERS)
}

describe('calibrationPatch (#31 anchor fix)', () => {
  it('scales the image so the calibration line measures the entered length', () => {
    const image = makeReferenceImage()
    const patch = calibrationPatch(image, { x: 0, y: 0 }, { x: 10, y: 0 }, 20)

    expect(patch?.width).toBeCloseTo(40)
    expect(patch?.height).toBeCloseTo(20)
  })

  it('keeps p1 fixed in world space so a recalibrated image does not drift', () => {
    // The old behavior multiplied width/height and left x/y alone, so the
    // image always grew down-and-right away from whatever it was aligned to.
    const image = makeReferenceImage({ x: 100, y: 100, width: 20, height: 10 })
    const p1 = { x: 105, y: 102 }
    const patch = calibrationPatch(image, p1, { x: 115, y: 102 }, 20)

    // p1 sits 5 units in and 2 down from the corner; at 2x it should sit 10
    // and 4 from the new corner, i.e. the point itself has not moved.
    expect(patch?.x).toBeCloseTo(95)
    expect(patch?.y).toBeCloseTo(98)
    expect(patch?.calibration?.p1).toEqual(p1)
  })

  it('stores p2 such that distance(p1, p2) equals realWorldDistance', () => {
    const image = makeReferenceImage()
    const patch = calibrationPatch(image, { x: 2, y: 2 }, { x: 7, y: 2 }, 30)
    const calibration = patch?.calibration

    expect(calibration).toBeTruthy()
    expect(distance(calibration!.p1, calibration!.p2)).toBeCloseTo(30)
  })

  it('is idempotent when recalibrating with the same line and length', () => {
    const image = makeReferenceImage()
    const first = calibrationPatch(image, { x: 0, y: 0 }, { x: 10, y: 0 }, 20)!
    const once = { ...image, ...first } as ReferenceImage

    const second = calibrationPatch(once, once.calibration!.p1, once.calibration!.p2, 20)!

    expect(second.width).toBeCloseTo(once.width)
    expect(second.height).toBeCloseTo(once.height)
    expect(second.x).toBeCloseTo(once.x)
    expect(second.y).toBeCloseTo(once.y)
  })

  it('preserves rotation and aspect ratio', () => {
    const image = makeReferenceImage({ rotation: 42 })
    const patch = calibrationPatch(image, { x: 0, y: 0 }, { x: 5, y: 0 }, 15)

    expect(patch?.rotation).toBeUndefined() // untouched by the patch
    expect(patch!.width! / patch!.height!).toBeCloseTo(image.width / image.height)
  })

  it('returns null for a zero-length line or a non-positive length', () => {
    const image = makeReferenceImage()
    expect(calibrationPatch(image, { x: 3, y: 3 }, { x: 3, y: 3 }, 10)).toBeNull()
    expect(calibrationPatch(image, { x: 0, y: 0 }, { x: 5, y: 0 }, 0)).toBeNull()
  })
})

describe('resizeImagePatch (#31 manual resize)', () => {
  it('scales the box about the stored top-left corner', () => {
    const image = makeReferenceImage({ x: 10, y: 10 })
    const patch = resizeImagePatch(image, 2)

    expect(patch?.x).toBeCloseTo(10)
    expect(patch?.y).toBeCloseTo(10)
    expect(patch?.width).toBeCloseTo(40)
    expect(patch?.height).toBeCloseTo(20)
  })

  it('scales calibration with the image so it stays true rather than stale', () => {
    const image = makeReferenceImage({
      calibration: { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, realWorldDistance: 10 },
    })
    const patch = resizeImagePatch(image, 3)!

    expect(patch.calibration?.realWorldDistance).toBeCloseTo(30)
    expect(distance(patch.calibration!.p1, patch.calibration!.p2)).toBeCloseTo(30)
  })

  it('rejects a non-positive scale', () => {
    expect(resizeImagePatch(makeReferenceImage(), 0)).toBeNull()
    expect(resizeImagePatch(makeReferenceImage(), -1)).toBeNull()
  })
})

describe('image import flow (#23)', () => {
  beforeEach(resetStores)

  function importImage() {
    beginImageImport({ dataUrl: 'data:image/png;base64,x', width: 200, height: 100 })
    return useProjectStore.getState().project.referenceImages[0]
  }

  it('adds the image and starts at the origin-placement step', () => {
    importImage()

    const { drawingState, activeTool } = useUIStore.getState()
    expect(useProjectStore.getState().project.referenceImages).toHaveLength(1)
    expect(activeTool).toBe('image')
    expect(drawingState?.kind).toBe('imageOrigin')
    expect(getImageFlowStep(drawingState)?.index).toBe(1)
  })

  it('places the origin on the first click and advances to calibration', () => {
    importImage()
    click({ x: 30, y: 40 })

    const image = useProjectStore.getState().project.referenceImages[0]
    expect(image.x).toBe(30)
    expect(image.y).toBe(40)
    const { drawingState } = useUIStore.getState()
    expect(drawingState?.kind).toBe('calibration')
    expect(drawingState?.kind === 'calibration' && drawingState.origin).toBe('import')
    expect(getImageFlowStep(drawingState)?.index).toBe(2)
  })

  it('walks through both calibration points and stops advancing at the length step', () => {
    importImage()
    click({ x: 0, y: 0 })
    click({ x: 1, y: 1 })
    expect(getImageFlowStep(useUIStore.getState().drawingState)?.index).toBe(3)

    click({ x: 11, y: 1 })
    expect(getImageFlowStep(useUIStore.getState().drawingState)?.index).toBe(4)

    // A stray click while the length dialog is open must not add a third point.
    click({ x: 50, y: 50 })
    const { drawingState } = useUIStore.getState()
    expect(drawingState?.kind === 'calibration' && drawingState.points).toHaveLength(2)
  })

  it('pushes exactly one history snapshot for the whole import', () => {
    importImage()
    click({ x: 0, y: 0 })
    click({ x: 1, y: 1 })
    click({ x: 11, y: 1 })
    applyCalibrationLength(20)

    expect(useHistoryStore.getState().past).toHaveLength(1)
  })

  it('applying the length calibrates the image and returns to the select tool', () => {
    importImage()
    click({ x: 0, y: 0 })
    click({ x: 0, y: 0 })
    click({ x: 10, y: 0 })

    expect(applyCalibrationLength(20)).toBe(true)

    const image = useProjectStore.getState().project.referenceImages[0]
    expect(image.calibration?.realWorldDistance).toBe(20)
    // Imported at DEFAULT_WIDTH_WORLD_UNITS (96); a 10-unit line declared as
    // 20 real units doubles the image.
    expect(image.width).toBeCloseTo(192)
    expect(useUIStore.getState().activeTool).toBe('select')
    expect(useUIStore.getState().drawingState).toBeNull()
  })

  it('cancelling during origin placement deletes the image and rewinds history', () => {
    importImage()
    cancelImageFlow()

    expect(useProjectStore.getState().project.referenceImages).toEqual([])
    expect(useHistoryStore.getState().past).toHaveLength(0)
    expect(useUIStore.getState().activeTool).toBe('select')
  })

  it('cancelling during calibration keeps the placed image, uncalibrated', () => {
    importImage()
    click({ x: 30, y: 40 })
    click({ x: 0, y: 0 })
    cancelImageFlow()

    const images = useProjectStore.getState().project.referenceImages
    expect(images).toHaveLength(1)
    expect(images[0].calibration).toBeNull()
    // The import's snapshot is still on the stack, so undo removes it.
    expect(useHistoryStore.getState().past).toHaveLength(1)
    expect(useUIStore.getState().activeTool).toBe('select')
  })

  it('redoCalibrationLine drops both points and returns to the first-point step', () => {
    importImage()
    click({ x: 0, y: 0 })
    click({ x: 0, y: 0 })
    click({ x: 10, y: 0 })

    redoCalibrationLine()

    const { drawingState } = useUIStore.getState()
    expect(drawingState?.kind === 'calibration' && drawingState.points).toEqual([])
    expect(getImageFlowStep(drawingState)?.index).toBe(2)
  })

  it('a pinch gesture at the length step pops one point and unblocks picking', () => {
    importImage()
    click({ x: 0, y: 0 })
    click({ x: 0, y: 0 })
    click({ x: 10, y: 0 })

    ImageTool.onGestureCancel?.()

    const { drawingState } = useUIStore.getState()
    expect(drawingState?.kind === 'calibration' && drawingState.points).toHaveLength(1)
    expect(getImageFlowStep(drawingState)?.index).toBe(3)
  })
})

describe('recalibration (#31)', () => {
  beforeEach(() => {
    resetStores()
    useProjectStore.setState((s) => ({
      project: { ...s.project, referenceImages: [makeReferenceImage()] },
    }))
    useUIStore.getState().setSelection(['img-1'])
  })

  it('enters calibration with no origin step and clears the selection', () => {
    startRecalibration('img-1')

    const { drawingState, activeTool, selectedIds } = useUIStore.getState()
    expect(activeTool).toBe('image')
    expect(drawingState?.kind).toBe('calibration')
    expect(drawingState?.kind === 'calibration' && drawingState.origin).toBe('recalibrate')
    // setActiveTool wipes the selection; endImageFlow restores it on the way out.
    expect(selectedIds).toEqual([])
  })

  it('re-selects the image and returns to the select tool once applied', () => {
    startRecalibration('img-1')
    click({ x: 0, y: 0 })
    click({ x: 10, y: 0 })

    expect(applyCalibrationLength(40)).toBe(true)

    expect(useUIStore.getState().activeTool).toBe('select')
    expect(useUIStore.getState().selectedIds).toEqual(['img-1'])
  })

  it('restores the selection on cancel without deleting the image or snapshotting', () => {
    startRecalibration('img-1')
    click({ x: 0, y: 0 })
    cancelImageFlow()

    expect(useProjectStore.getState().project.referenceImages).toHaveLength(1)
    expect(useHistoryStore.getState().past).toHaveLength(0)
    expect(useUIStore.getState().selectedIds).toEqual(['img-1'])
  })

  it('pushes exactly one snapshot when a recalibration is applied', () => {
    startRecalibration('img-1')
    click({ x: 0, y: 0 })
    click({ x: 10, y: 0 })
    applyCalibrationLength(40)

    expect(useHistoryStore.getState().past).toHaveLength(1)
  })

  it('keeps p1 fixed so recalibrating does not shift the image off its alignment', () => {
    useProjectStore.setState((s) => ({
      project: { ...s.project, referenceImages: [makeReferenceImage({ x: 50, y: 50 })] },
    }))

    startRecalibration('img-1')
    const p1 = { x: 55, y: 52 }
    click(p1)
    click({ x: 65, y: 52 })
    applyCalibrationLength(20)

    const image = useProjectStore.getState().project.referenceImages[0]
    // p1 was 5 right / 2 down from the corner; at 2x it is 10 / 4 from the new
    // corner, so the world point the user clicked has not moved.
    expect(image.x + 10).toBeCloseTo(p1.x)
    expect(image.y + 4).toBeCloseTo(p1.y)
  })
})
