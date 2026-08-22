import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import {
  activeFurnitureLayout,
  createFurnitureLayout,
  duplicateFurnitureLayout,
  findFurnitureLayout,
  nextLayoutName,
  uniqueLayoutName,
} from './layouts'

/** The store-and-history side of furniture layouts (L1, #28): every layout
 * command the UI can issue, in one place.
 *
 * These sit outside the components (and outside projectStore) because each
 * one spans three stores - a history snapshot, a project mutation, and a
 * selection reset - and the tab strip, the tab context menu and a click on a
 * comparison pane all issue the same commands. Same shape as
 * `ImageTool.startImageImport`, which MenuBar calls for the same reason.
 *
 * Snapshot policy: creating, duplicating, renaming and deleting a layout are
 * edits to the project and are undoable. *Switching* layouts is navigation and
 * is not - it would otherwise put an undo step between the user and the edit
 * they actually want to take back.
 */

/** Selection is per-layout in everything but name: `selectedIds` holds
 * furniture ids, and after a switch those ids name instances that are no
 * longer on the canvas. Clearing is what keeps the properties panel, the
 * highlight layer, and `removeEntities` all pointed at what's visible. */
function clearFurnitureSelection(): void {
  const { clearSelection, setDragState, setMarquee, setInteractionMode, setDragAnchorWorld } =
    useUIStore.getState()
  clearSelection()
  // A layout can be switched from a comparison pane mid-gesture; drop any
  // in-flight drag so it can't commit against the layout that just went away.
  setDragState(null)
  setMarquee(null)
  setInteractionMode('idle')
  setDragAnchorWorld(null)
}

export function activateFurnitureLayout(layoutId: string): void {
  const { project, setActiveFurnitureLayout } = useProjectStore.getState()
  if (activeFurnitureLayout(project)?.id === layoutId) return
  clearFurnitureSelection()
  setActiveFurnitureLayout(layoutId)
}

/** New empty variant of the same room shell, switched to on creation. */
export function createFurnitureLayoutAndActivate(): void {
  const { project, addFurnitureLayout } = useProjectStore.getState()
  useHistoryStore.getState().pushSnapshot(project)
  clearFurnitureSelection()
  addFurnitureLayout(createFurnitureLayout(nextLayoutName(project.furnitureLayouts)))
}

/** Copy of an existing layout - the usual way to start a variant, since you
 * want to move a few pieces rather than re-place all of them. */
export function duplicateFurnitureLayoutAndActivate(layoutId: string): void {
  const { project, addFurnitureLayout } = useProjectStore.getState()
  const source = findFurnitureLayout(project, layoutId)
  if (!source) return
  useHistoryStore.getState().pushSnapshot(project)
  clearFurnitureSelection()
  addFurnitureLayout(
    duplicateFurnitureLayout(
      source,
      uniqueLayoutName(project.furnitureLayouts, `${source.name} copy`),
    ),
  )
}

export function renameFurnitureLayout(layoutId: string, name: string): void {
  const { project, renameFurnitureLayout: rename } = useProjectStore.getState()
  useHistoryStore.getState().pushSnapshot(project)
  rename(layoutId, name)
}

/** Deleting the last layout is refused by the store, so this is safe to call
 * from a menu that hasn't re-checked the count. */
export function deleteFurnitureLayout(layoutId: string): void {
  const { project, removeFurnitureLayout } = useProjectStore.getState()
  if (project.furnitureLayouts.length <= 1) return
  useHistoryStore.getState().pushSnapshot(project)
  clearFurnitureSelection()
  removeFurnitureLayout(layoutId)
  // A deleted layout must not linger in the comparison set, or the compare
  // view would keep a slot open for a layout that no longer exists. With only
  // one layout left there is nothing to compare it against, so compare mode
  // closes rather than showing a single pane with a header on it.
  const ui = useUIStore.getState()
  ui.removeComparedLayout(layoutId)
  if (useProjectStore.getState().project.furnitureLayouts.length < 2) ui.closeComparison()
}
