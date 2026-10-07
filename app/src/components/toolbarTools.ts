import { useUIStore, type Tool } from '../store/uiStore'
import { startImageImport } from '../canvas/tools/ImageTool'
import type { ShortcutId } from '../keyboard/shortcuts'

/** Toolbar order; each tool's number key (#24) comes from the shortcut
 * registry, and the button and the key share selectTool below. */
export const TOOLBAR_TOOLS: { id: Tool; label: string; shortcutId: ShortcutId }[] = [
  { id: 'select', label: 'Select', shortcutId: 'tool.select' },
  { id: 'room', label: 'Room', shortcutId: 'tool.room' },
  { id: 'interiorWall', label: 'Interior Wall', shortcutId: 'tool.interiorWall' },
  { id: 'image', label: 'Image', shortcutId: 'tool.image' },
  { id: 'annotation', label: 'Annotate', shortcutId: 'tool.annotation' },
]

export function selectTool(id: Tool) {
  if (id === 'image') startImageImport()
  else useUIStore.getState().setActiveTool(id)
}
