import type { ToolHandlers } from './SelectTool'
import type { Point, ReferenceImage } from '../../types/project'
import { useUIStore, cancelDrawingGesture } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { useHistoryStore } from '../../store/historyStore'
import { distance, scalePointAbout } from '../../utils/geometry'
import { matchesShortcut } from '../../keyboard/shortcuts'
import { openImageFile, ImageLoadError, type LoadedImage } from '../../io/loadImage'

const DEFAULT_WIDTH_WORLD_UNITS = 96 // ~8ft at default (uncalibrated) scale

/** I4 (#23): the whole import is one committed action - one snapshot, pushed
 * before the image is added, covering placement and calibration too. So a
 * single Ctrl+Z after a finished import removes the image outright rather
 * than unwinding it a step at a time, and cancelling partway can rewind to
 * before it existed (see cancelImageFlow). */
export function beginImageImport({ dataUrl, width, height }: LoadedImage) {
  const aspect = height / width
  const defaultWidth = DEFAULT_WIDTH_WORLD_UNITS
  const image: ReferenceImage = {
    id: crypto.randomUUID(),
    name: 'Reference Image',
    src: dataUrl,
    x: 0,
    y: 0,
    width: defaultWidth,
    height: defaultWidth * aspect,
    rotation: 0,
    opacity: 0.6,
    locked: false,
    visible: true,
    calibration: null,
  }
  useHistoryStore.getState().pushSnapshot(useProjectStore.getState().project)
  useProjectStore.getState().addReferenceImage(image)
  // G4: origin placement runs before calibration — the user first says
  // where the image's outer top-left corner lands in world space, then
  // (once that's confirmed) calibration sets the scale. Composing them
  // this way means calibration's own point-picking always operates on an
  // image that's already positioned where the user expects it.
  useUIStore.getState().setActiveTool('image')
  useUIStore.getState().setDrawingState({ kind: 'imageOrigin', imageId: image.id, cursor: null })
}

export function startImageImport() {
  openImageFile()
    .then(beginImageImport)
    .catch((e) => {
      if (e instanceof ImageLoadError) window.alert(e.message)
    })
}

/** L4 (#31): re-run calibration against an image that's already placed, from
 * the Properties panel. No origin step (the image is where the user put it)
 * and no snapshot until the length is applied, so backing out costs nothing.
 *
 * setActiveTool MUST come first: it wipes selectedIds and drawingState, so
 * setting the drawing state before it would silently clear it. The image is
 * deselected as a side effect and re-selected by endImageFlow on the way out.
 */
export function startRecalibration(imageId: string) {
  const ui = useUIStore.getState()
  ui.setActiveTool('image')
  ui.setDrawingState({ kind: 'calibration', imageId, points: [], cursor: null, origin: 'recalibrate' })
}

/** Shared teardown for every exit from the image flow, successful or not.
 * setActiveTool wipes the selection, so re-selecting has to come after it. */
function endImageFlow(imageId: string, origin: 'import' | 'recalibrate') {
  const ui = useUIStore.getState()
  ui.setActiveTool('select')
  // A recalibration is a round trip: the user started from the image selected
  // in the Properties panel and should land back there. A fresh import ends
  // with nothing selected, as it always has.
  if (origin === 'recalibrate') ui.setSelection([imageId])
}

/** The rescale a calibration implies, as a patch - pure, so the math is
 * testable without driving the stores.
 *
 * Scales uniformly about `p1` rather than about the image's stored top-left
 * corner. The old behavior multiplied width/height and left x/y alone, so the
 * image always grew down-and-right; on a *re*calibration that drags a photo
 * off whatever room it was just aligned to. `p1` is a feature the user
 * deliberately clicked on, which makes it the one point that should not move.
 *
 * Scaling about a fixed point commutes with rotation about the center, so
 * `rotation` needs no adjustment. `p2` is stored post-scale, which keeps the
 * invariant `distance(p1, p2) === realWorldDistance` and makes recalibrating
 * with the same line and length a no-op.
 */
export function calibrationPatch(
  image: ReferenceImage,
  p1: Point,
  p2: Point,
  realLength: number,
): Partial<ReferenceImage> | null {
  const worldDist = distance(p1, p2)
  if (worldDist <= 0 || realLength <= 0) return null
  const s = realLength / worldDist

  return {
    ...scaleImageAbout(image, s, p1),
    calibration: {
      p1,
      p2: scalePointAbout(p2, p1, s),
      realWorldDistance: realLength,
    },
  }
}

/** Uniformly scales an image's box by `s` about a fixed world point.
 * Rotation happens about the image's center, so the center is what has to be
 * scaled - moving the stored top-left corner directly would slide a rotated
 * image sideways. */
export function scaleImageAbout(
  image: Pick<ReferenceImage, 'x' | 'y' | 'width' | 'height'>,
  s: number,
  anchor: Point,
): Pick<ReferenceImage, 'x' | 'y' | 'width' | 'height'> {
  const center = { x: image.x + image.width / 2, y: image.y + image.height / 2 }
  const scaledCenter = scalePointAbout(center, anchor, s)
  const width = image.width * s
  const height = image.height * s
  return { x: scaledCenter.x - width / 2, y: scaledCenter.y - height / 2, width, height }
}

/** L4 (#31): a manual width/height edit in the Properties panel. Aspect ratio
 * is preserved (the photo would otherwise distort), anchored on the stored
 * top-left corner so the numbers in the panel behave the way they read.
 *
 * Calibration is scaled rather than discarded: making the photo twice as big
 * makes the real-world feature it depicts twice as long, so scaling p1/p2 and
 * realWorldDistance by the same factor keeps the calibration *true* instead
 * of stale. The invariant distance(p1, p2) === realWorldDistance survives. */
export function resizeImagePatch(
  image: ReferenceImage,
  scale: number,
): Partial<ReferenceImage> | null {
  if (!Number.isFinite(scale) || scale <= 0) return null
  const anchor = { x: image.x, y: image.y }
  return {
    ...scaleImageAbout(image, scale, anchor),
    calibration: image.calibration
      ? {
          p1: scalePointAbout(image.calibration.p1, anchor, scale),
          p2: scalePointAbout(image.calibration.p2, anchor, scale),
          realWorldDistance: image.calibration.realWorldDistance * scale,
        }
      : null,
  }
}

/** Commits the real-world length collected by CalibrationLengthDialog.
 * Returns false when the flow isn't at the length step or the line is
 * degenerate, so the dialog can keep itself open instead of closing on a
 * no-op. */
export function applyCalibrationLength(realLength: number): boolean {
  const drawingState = useUIStore.getState().drawingState
  if (drawingState?.kind !== 'calibration' || drawingState.points.length < 2) return false
  const { imageId, points, origin } = drawingState

  const { project, updateReferenceImage } = useProjectStore.getState()
  const image = project.referenceImages.find((r) => r.id === imageId)
  if (!image) return false

  const patch = calibrationPatch(image, points[0], points[1], realLength)
  if (!patch) return false

  // An import already snapshotted before adding the image, and the whole
  // import is one undo step; a recalibration is its own committed action and
  // needs its own snapshot.
  if (origin === 'recalibrate') useHistoryStore.getState().pushSnapshot(project)
  updateReferenceImage(imageId, patch)
  endImageFlow(imageId, origin)
  return true
}

/** Drops both measuring points so the user can re-draw the line without
 * leaving the flow - the dialog's "Redo line" button. */
export function redoCalibrationLine() {
  const drawingState = useUIStore.getState().drawingState
  if (drawingState?.kind !== 'calibration') return
  useUIStore.getState().setDrawingState({ ...drawingState, points: [], cursor: null })
}

// H1: named so onKeyDown, onRightClick, and ToolHandlers.onCancel share one
// implementation instead of each reimplementing the same kind dispatch.
export function cancelImageFlow() {
  const drawingState = useUIStore.getState().drawingState
  if (drawingState?.kind === 'imageOrigin') {
    // I4 (#23): bailing out before the image has ever been positioned should
    // leave nothing behind. Previously this stranded an uncalibrated image at
    // (0,0) that the user had no obvious way to get rid of. Dropping the
    // matching snapshot too means the cancel doesn't leave a dead undo step.
    useProjectStore.getState().removeReferenceImage(drawingState.imageId)
    useHistoryStore.getState().popSnapshot()
    endImageFlow(drawingState.imageId, 'import')
    return
  }
  if (drawingState?.kind === 'calibration') {
    // The image is placed by this point, so it's kept - just uncalibrated.
    // The Properties panel says as much and offers Recalibrate. (Undo still
    // removes it: the import's snapshot is still on the stack.)
    endImageFlow(drawingState.imageId, drawingState.origin)
  }
}

export const ImageTool: ToolHandlers = {
  onPointerDown(worldPt: Point, _rawWorldPt: Point, _ppu: number, _modifiers) {
    const { drawingState, setDrawingState } = useUIStore.getState()
    if (!drawingState) return
    if (drawingState.kind === 'imageOrigin') {
      const { project, updateReferenceImage } = useProjectStore.getState()
      const image = project.referenceImages.find((r) => r.id === drawingState.imageId)
      // No snapshot here: placement is part of the one import action.
      if (image) updateReferenceImage(drawingState.imageId, { x: worldPt.x, y: worldPt.y })
      setDrawingState({
        kind: 'calibration',
        imageId: drawingState.imageId,
        points: [],
        cursor: null,
        origin: 'import',
      })
      return
    }
    if (drawingState.kind !== 'calibration') return
    // Both points already placed: the flow is waiting on the length dialog,
    // so ignore stray canvas clicks rather than starting a third point.
    if (drawingState.points.length >= 2) return
    const pts = [...drawingState.points, worldPt]
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
    if (matchesShortcut(e, 'drawing.cancel')) cancelImageFlow()
  },
  onRightClick: cancelImageFlow,
  onCancel: cancelImageFlow,
  // A pinch started mid-calibration: the first finger added a stray
  // calibration point - pop it so the user can zoom in for precision and
  // re-pick. (imageOrigin commits on pointer-down and hands off to
  // calibration with zero points, so there's nothing to pop there; the
  // placed origin stays undoable.) See H2/cancelDrawingGesture.
  onGestureCancel() {
    cancelDrawingGesture('calibration')
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
