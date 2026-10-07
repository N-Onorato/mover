import type { Point } from '../../types/project'

/** Keyboard modifiers active for a pointer event, forwarded by LayoutCanvas
 * from the native MouseEvent so tools don't need their own window listeners. */
export interface PointerModifiers {
  shift: boolean
  ctrl: boolean
}

export interface ToolHandlers {
  /** rawWorldPt is the same pointer-down position as worldPt but never
   * grid-snapped, regardless of wantsRawPointer() - hit-testing should always
   * use it, since snapping the click location (rather than the eventual
   * placed/dragged position) has no upside for hit-testing precision. */
  onPointerDown(worldPt: Point, rawWorldPt: Point, pixelsPerUnit: number, modifiers: PointerModifiers): void
  onPointerMove(worldPt: Point, pixelsPerUnit: number, modifiers: PointerModifiers): void
  onPointerUp(worldPt: Point, pixelsPerUnit: number, modifiers: PointerModifiers): void
  onKeyDown(e: KeyboardEvent): void
  onRightClick(): void
  /** Whether this tool wants raw (unsnapped) pointer coordinates instead of
   * grid-snapped ones. Defaults to false (snapped) when omitted. */
  wantsRawPointer?(): boolean
  /** Called when a pointer-down already dispatched to this tool turns out to
   * be the start of a multi-touch gesture (pinch/pan) or is cancelled by the
   * browser. The tool should discard whatever that stray pointer-down
   * started, without committing anything. */
  onGestureCancel?(): void
  /** H1: semantic actions a tool's onKeyDown reacts to (Escape/Enter/
   * Backspace), exposed as their own methods so DrawingControls' touch
   * buttons can call them directly instead of constructing a synthetic
   * KeyboardEvent and hoping the active tool's key bindings never change.
   * Each tool's onKeyDown should call these same methods rather than
   * duplicating their logic inline. Present only on tools with an in-progress
   * drawingState to finish/step-back/cancel. */
  onFinish?(): void
  onUndoStep?(): void
  onCancel?(): void
}
