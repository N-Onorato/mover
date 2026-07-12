import type { ToolHandlers } from './SelectTool'
import { SelectTool } from './SelectTool'
import { RoomTool } from './RoomTool'
import { InteriorWallTool } from './InteriorWallTool'
import { ImageTool } from './ImageTool'
import { AnnotationTool } from './AnnotationTool'

/** Active-tool dispatch table, keyed by uiStore's Tool id. Lives here (not in
 * LayoutCanvas) so non-canvas UI like DrawingControls can reach the same tool
 * instances without importing the canvas component. */
export const TOOLS: Record<string, ToolHandlers> = {
  select: SelectTool,
  room: RoomTool,
  interiorWall: InteriorWallTool,
  image: ImageTool,
  annotation: AnnotationTool,
}
