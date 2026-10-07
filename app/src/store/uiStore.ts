import { create } from 'zustand'
import type { Point } from '../types/project'

export type Tool = 'select' | 'room' | 'interiorWall' | 'image' | 'annotation'

export interface ViewState {
  x: number
  y: number
  scale: number
}

// Pan offset so world (0,0) lands a bit in from the container's top-left
// corner instead of exactly under the ruler corner box, where it's
// invisible on a fresh load. RULER_THICKNESS (canvas/Rulers.tsx) clears the
// ruler overlay; the rest leaves ~1ft of world space visible above/left of
// the origin at the default 10px/ft (BASE_PIXELS_PER_UNIT) scale.
export const DEFAULT_VIEW: ViewState = { x: 30, y: 30, scale: 1 }

export interface RoomDrawingState {
  kind: 'room'
  points: Point[]       // committed vertices in world space
  cursor: Point | null  // current cursor in world space (snapped)
}

export interface CalibrationDrawingState {
  kind: 'calibration'
  imageId: string
  /** 0, 1, or 2 committed points in world space. 2 means both ends of the
   * measuring line are placed and the flow is waiting on the real-world
   * length from CalibrationLengthDialog - the step where no further canvas
   * clicks are accepted. */
  points: Point[]
  cursor: Point | null  // current cursor in world space
  /** Whether this calibration is part of a fresh import or a Recalibrate on
   * an image that's already placed. Decides what cancelling does: an import
   * cancel discards the half-imported image, a recalibrate cancel must leave
   * the existing image completely alone. */
  origin: 'import' | 'recalibrate'
}

export interface ImageOriginDrawingState {
  kind: 'imageOrigin'
  imageId: string
  cursor: Point | null  // current cursor in world space
}

export interface InteriorWallDrawingState {
  kind: 'interiorWall'
  roomId: string
  a: Point        // committed (snapped) start point in world space
  cursor: Point | null  // current cursor in world space (snap-previewed)
}

export type DrawingState =
  | RoomDrawingState
  | CalibrationDrawingState
  | ImageOriginDrawingState
  | InteriorWallDrawingState

export interface SelectedWall {
  roomId: string
  edgeIndex: number
}

export interface MarqueeState {
  start: Point // world space
  end: Point // world space
  additive: boolean // shift-drag: add to existing selection instead of replacing it
}

export interface WallDragState {
  kind: 'wall'
  roomId: string
  edgeIndex: number
  originalPoints: Point[] // room.points snapshot at drag start
  currentPoints: Point[] // live-updated preview during drag
}

export interface VertexDragState {
  kind: 'vertex'
  roomId: string
  vertexIndex: number
  originalPoints: Point[]
  currentPoints: Point[]
}

export interface InteriorWallEndpointDragState {
  kind: 'interiorWallEndpoint'
  wallId: string
  which: 'a' | 'b'
  originalA: Point
  originalB: Point
  currentA: Point
  currentB: Point
}

export interface FurnitureResizeDragState {
  kind: 'furnitureResize'
  id: string
  corner: 0 | 1 | 2 | 3 // index into rectPoints(x,y,w,h) order: TL,TR,BR,BL
  rotation: number // fixed for the duration of the resize
  originalX: number
  originalY: number
  originalWidth: number
  originalDepth: number
  currentX: number
  currentY: number
  currentWidth: number
  currentDepth: number
}

export interface FurnitureRotateDragState {
  kind: 'furnitureRotate'
  id: string
  center: Point
  originalRotation: number
  currentRotation: number
}

/** The single rigid-translation drag path for rooms, furniture, interior
 * walls, and reference images: dragging any selected body moves every
 * selected item of every type together (a lone selected item is just the
 * one-element case), preserving relative positions. Interior walls anchored
 * to a selected room ride along automatically even when not themselves
 * selected. Shape/rotation edits (vertex, wall-edge, furniture resize/rotate,
 * interior-wall endpoint) aren't rigid translations and keep their own
 * dedicated drag states below instead of folding into this one.
 *
 * F2: only the translation offset is stored, not a materialized copy of every
 * dragged entity's points/position - nothing in projectStore is mutated until
 * commit, so `dx`/`dy` applied to the still-current project state is always
 * equivalent to a snapshot-plus-delta, without allocating new point arrays on
 * every pointer-move. */
export interface MultiDragState {
  kind: 'multi'
  roomIds: string[]
  furnitureIds: string[]
  wallIds: string[]
  imageIds: string[]
  dx: number
  dy: number
}

/** O7 (#47): the multi-selection rotate drag - every selected room, furniture
 * instance, interior wall and reference image rotates as one rigid body about
 * `pivot` (the center of the selection's bounding box, frozen at pointer-down
 * so the pivot doesn't wander as the preview changes). Same id lists as
 * MultiDragState, built by the same function, so move and rotate always
 * agree on what is in the selection.
 *
 * Like the multi-move state it only stores the transform: nothing in
 * projectStore is touched until pointer-up, and the preview layers derive
 * live geometry by rotating the still-current project state by `delta`. */
export interface MultiRotateDragState {
  kind: 'multiRotate'
  roomIds: string[]
  furnitureIds: string[]
  wallIds: string[]
  imageIds: string[]
  pivot: Point
  /** Live rotation in degrees (positive = clockwise), already snapped. */
  delta: number
}

export type DragState =
  | WallDragState
  | VertexDragState
  | InteriorWallEndpointDragState
  | FurnitureResizeDragState
  | FurnitureRotateDragState
  | MultiDragState
  | MultiRotateDragState

/** SelectTool's interaction state machine. Lives in the store (rather than a
 * tool-module-level `let`) so it's inspectable and can't drift out of sync
 * with re-renders. */
export type InteractionMode =
  | 'idle'
  | 'marquee'
  | 'wall'
  | 'vertex'
  | 'interiorWallEndpoint'
  | 'furnitureResize'
  | 'furnitureRotate'
  | 'multi'
  | 'multiRotate'

export type CatalogTab = 'catalog' | 'sets'

interface UIStore {
  activeTool: Tool
  selectedIds: string[]
  selectedWall: SelectedWall | null
  showGrid: boolean
  drawingState: DrawingState | null
  marquee: MarqueeState | null
  dragState: DragState | null
  interactionMode: InteractionMode
  dragAnchorWorld: Point | null
  /** Catalog definition armed for tap-to-place: the next canvas click/tap
   * places this furniture instead of dispatching to the active tool. The
   * touch-friendly alternative to HTML5 drag-and-drop (which never fires on
   * touchscreens). */
  pendingPlacementDefId: string | null
  /** Which tab the catalog panel shows. Kept here rather than in the panel
   * because the mobile drawer unmounts CatalogPanel every time it closes, and
   * because saving a piece switches the panel to Sets so the user sees where
   * it landed. Deliberately not reset by setActiveTool - picking the room
   * tool shouldn't flip the catalog back. */
  catalogTab: CatalogTab
  /** L1 (#28): whether the canvas column shows one layout or several side by
   * side. Lives here, not in the project, because it's how you're looking at
   * the plan rather than part of it - it isn't saved and doesn't travel with
   * a shared `.mover.json`. */
  compareMode: boolean
  /** Layout ids included in the side-by-side view. The active layout is
   * always rendered whether or not it's listed (it's the one being edited),
   * and ids of deleted layouts are dropped as they go. */
  comparedLayoutIds: string[]
  showWallLabels: boolean
  showLayers: {
    referenceImages: boolean
    rooms: boolean
    furniture: boolean
    annotations: boolean
  }
  lockedLayers: {
    referenceImages: boolean
    rooms: boolean
    furniture: boolean
    annotations: boolean
  }
  view: ViewState

  setActiveTool: (tool: Tool) => void
  setSelection: (ids: string[]) => void
  addToSelection: (id: string) => void
  clearSelection: () => void
  setSelectedWall: (wall: SelectedWall | null) => void
  toggleGrid: () => void
  setDrawingState: (state: DrawingState | null) => void
  setMarquee: (marquee: MarqueeState | null) => void
  setDragState: (dragState: DragState | null) => void
  setInteractionMode: (mode: InteractionMode) => void
  setDragAnchorWorld: (pt: Point | null) => void
  setPendingPlacement: (defId: string | null) => void
  setCatalogTab: (tab: CatalogTab) => void
  /** Enters compare mode showing exactly `layoutIds` (plus the active one). */
  openComparison: (layoutIds: string[]) => void
  closeComparison: () => void
  toggleComparedLayout: (id: string) => void
  removeComparedLayout: (id: string) => void
  toggleWallLabels: () => void
  toggleLayerVisibility: (layer: keyof UIStore['showLayers']) => void
  toggleLayerLock: (layer: keyof UIStore['lockedLayers']) => void
  setView: (view: ViewState) => void
}

/** Idle-state label shown for each tool when no operation is in progress. */
export const TOOL_LABELS: Record<Tool, string> = {
  select: 'Select',
  room: 'Room',
  interiorWall: 'Interior Wall',
  image: 'Image',
  annotation: 'Annotation',
}

/**
 * Derives a short status-bar hint for the active tool, taking any
 * in-progress drawingState into account. Purely a read-only helper over
 * existing state — safe to call from any component.
 */
/** I4 (#23): the reference-image import flow is four steps long and none of
 * them are self-explanatory - especially calibration, where the user is asked
 * to click two points without being told those two clicks are what sets the
 * photo's real-world scale. This table is the single source of truth for that
 * copy: the status bar (via getToolHint), the on-canvas FlowIndicator, and
 * CalibrationLengthDialog all render from it, so the wording can't drift
 * between them. */
export interface ImageFlowStep {
  id: 'origin' | 'firstPoint' | 'secondPoint' | 'length'
  /** 1-based position, for "Step 2 of 4". */
  index: number
  total: number
  label: string
  /** What to do now, and (for the calibration steps) why. */
  hint: string
}

export const IMAGE_FLOW_STEPS: readonly ImageFlowStep[] = [
  {
    id: 'origin',
    index: 1,
    total: 4,
    label: 'Place the image',
    hint: "click where the photo's top-left corner belongs on the plan",
  },
  {
    id: 'firstPoint',
    index: 2,
    total: 4,
    label: 'Set the scale',
    hint: 'the next two clicks set how big the photo really is: click one end of something whose length you know (a doorway, a wall)',
  },
  {
    id: 'secondPoint',
    index: 3,
    total: 4,
    label: 'Set the scale',
    hint: 'click the other end of that same feature',
  },
  {
    id: 'length',
    index: 4,
    total: 4,
    label: 'Set the scale',
    hint: 'enter how long that line is in the real world',
  },
]

const IMAGE_FLOW_BY_ID = new Map(IMAGE_FLOW_STEPS.map((s) => [s.id, s]))

/** Which step of the reference-image flow the given drawing state represents,
 * or null when the flow isn't running. */
export function getImageFlowStep(drawingState: DrawingState | null): ImageFlowStep | null {
  if (drawingState?.kind === 'imageOrigin') return IMAGE_FLOW_BY_ID.get('origin') ?? null
  if (drawingState?.kind === 'calibration') {
    if (drawingState.points.length === 0) return IMAGE_FLOW_BY_ID.get('firstPoint') ?? null
    if (drawingState.points.length === 1) return IMAGE_FLOW_BY_ID.get('secondPoint') ?? null
    return IMAGE_FLOW_BY_ID.get('length') ?? null
  }
  return null
}

/** M2 (#33): extra state the select-tool hint needs to explain why a click
 * landed on a room rather than the reference image under it. Passed in rather
 * than read off the store so getToolHint stays a pure function. */
export interface ToolHintContext {
  /** Whether the reference-images layer is locked (its default). */
  imagesLocked: boolean
  /** Whether the project has any reference images at all. */
  hasImages: boolean
}

export function getToolHint(
  activeTool: Tool,
  drawingState: DrawingState | null,
  pendingPlacementName?: string | null,
  context?: ToolHintContext,
): string {
  if (pendingPlacementName) {
    return `Place: click or tap the canvas to place ${pendingPlacementName} (Esc to cancel)`
  }
  if (drawingState?.kind === 'room') {
    return drawingState.points.length < 3
      ? 'Room: click to add point'
      : 'Room: click to add point, double-click or click first point to close'
  }
  // Derived from IMAGE_FLOW_STEPS rather than spelled out again here, so the
  // status bar always agrees with the on-canvas FlowIndicator.
  const imageStep = getImageFlowStep(drawingState)
  if (imageStep) {
    return `${imageStep.label} (${imageStep.index}/${imageStep.total}): ${imageStep.hint}`
  }
  if (drawingState?.kind === 'interiorWall') {
    return 'Interior Wall: click to place the second point'
  }
  switch (activeTool) {
    case 'select':
      // The tip only shows once images are unlocked - that's exactly when a
      // user starts clicking them and is surprised the room on top wins.
      return context?.hasImages && !context.imagesLocked
        ? 'Select: click to select, drag to marquee-select · rooms sit on top: lock the Rooms layer to click a reference image underneath'
        : 'Select: click to select, drag to marquee-select'
    case 'room':
      return 'Room: click to start drawing'
    case 'interiorWall':
      return 'Interior Wall: click a point inside a room to start'
    case 'image':
      return 'Image: import a photo, then calibrate its scale'
    case 'annotation':
      return 'Annotation: click to place label'
    default:
      return TOOL_LABELS[activeTool] ?? ''
  }
}

export const useUIStore = create<UIStore>((set) => ({
  activeTool: 'select',
  selectedIds: [],
  selectedWall: null,
  showGrid: true,
  drawingState: null,
  marquee: null,
  dragState: null,
  interactionMode: 'idle',
  dragAnchorWorld: null,
  pendingPlacementDefId: null,
  catalogTab: 'catalog',
  compareMode: false,
  comparedLayoutIds: [],
  showWallLabels: true,
  showLayers: {
    referenceImages: true,
    rooms: true,
    furniture: true,
    annotations: true,
  },
  lockedLayers: {
    referenceImages: true,
    rooms: false,
    furniture: false,
    annotations: false,
  },
  view: DEFAULT_VIEW,

  setActiveTool: (tool) =>
    set({
      activeTool: tool,
      selectedIds: [],
      selectedWall: null,
      drawingState: null,
      marquee: null,
      dragState: null,
      interactionMode: 'idle',
      dragAnchorWorld: null,
      pendingPlacementDefId: null,
    }),
  setSelection: (ids) => set({ selectedIds: ids, selectedWall: null }),
  addToSelection: (id) => set((s) => ({ selectedIds: [...s.selectedIds, id] })),
  clearSelection: () => set({ selectedIds: [], selectedWall: null }),
  setSelectedWall: (wall) => set({ selectedWall: wall }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setDrawingState: (state) => set({ drawingState: state }),
  setMarquee: (marquee) => set({ marquee }),
  setDragState: (dragState) => set({ dragState }),
  setInteractionMode: (mode) => set({ interactionMode: mode }),
  setDragAnchorWorld: (pt) => set({ dragAnchorWorld: pt }),
  setPendingPlacement: (defId) => set({ pendingPlacementDefId: defId }),
  setCatalogTab: (tab) => set({ catalogTab: tab }),
  openComparison: (layoutIds) => set({ compareMode: true, comparedLayoutIds: layoutIds }),
  closeComparison: () => set({ compareMode: false }),
  toggleComparedLayout: (id) =>
    set((s) => ({
      comparedLayoutIds: s.comparedLayoutIds.includes(id)
        ? s.comparedLayoutIds.filter((x) => x !== id)
        : [...s.comparedLayoutIds, id],
    })),
  removeComparedLayout: (id) =>
    set((s) => ({ comparedLayoutIds: s.comparedLayoutIds.filter((x) => x !== id) })),
  toggleWallLabels: () => set((s) => ({ showWallLabels: !s.showWallLabels })),
  toggleLayerVisibility: (layer) =>
    set((s) => ({
      showLayers: { ...s.showLayers, [layer]: !s.showLayers[layer] },
    })),
  toggleLayerLock: (layer) =>
    set((s) => ({
      lockedLayers: { ...s.lockedLayers, [layer]: !s.lockedLayers[layer] },
    })),
  setView: (view) => set({ view }),
}))

/** H2: shared "drop whatever this drawing state represents" behavior for a
 * gesture-cancel (a stray pointer-down turning into a pinch/pan mid-draw),
 * used by every ToolHandlers.onGestureCancel that operates on drawingState
 * (room, calibration, interior wall) instead of each tool duplicating its own
 * near-identical version. Point-array kinds (room, calibration) pop their
 * last committed point; the whole drawing state is dropped once popping
 * would leave the kind below its minimum meaningful point count - which
 * differs per kind: a room can't meaningfully exist with 0 points (its
 * drawingState is only ever created with the first point already in it), so
 * it's abandoned entirely at 1, whereas calibration's drawingState is
 * created *before* its first point is placed, so 0 points is already a
 * normal "waiting for the first click" state to pop back down to. Interior
 * wall carries a single anchor point (not an array), so there's nothing
 * partial to fall back to - any gesture-cancel just drops it. */
export function cancelDrawingGesture(kind: 'room' | 'calibration' | 'interiorWall') {
  const { drawingState, setDrawingState } = useUIStore.getState()
  if (!drawingState || drawingState.kind !== kind) return

  if (drawingState.kind === 'room') {
    if (drawingState.points.length <= 1) {
      setDrawingState(null)
    } else {
      setDrawingState({ ...drawingState, points: drawingState.points.slice(0, -1) })
    }
    return
  }

  if (drawingState.kind === 'calibration') {
    if (drawingState.points.length > 0) {
      setDrawingState({ ...drawingState, points: drawingState.points.slice(0, -1) })
    }
    return
  }

  setDrawingState(null)
}
