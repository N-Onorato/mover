import type { FurnitureInstance, FurnitureLayout, Project } from '../types/project'

/** Pure helpers over `Project.furnitureLayouts` (L1, #28).
 *
 * Every furniture read in the app goes through `activeFurnitureInstances` (or
 * `layoutFurniture` for a comparison pane) rather than reaching into the
 * project directly, so "which layout am I looking at" is decided in exactly
 * one place.
 *
 * Nothing here touches a store - these are used by the store, by React
 * selectors, and by tests alike. The store-and-history side of layout
 * management lives in project/layoutActions.ts.
 */

/** Name given to the layout a fresh project starts with, and to the one a
 * pre-1.1 file's flat furniture array is migrated into. */
export const DEFAULT_LAYOUT_NAME = 'Layout 1'

/** A single shared empty array, so `activeFurnitureInstances` returns a
 * referentially stable value for a project with no layouts. zustand selectors
 * compare by identity: a fresh `[]` on every call would re-render every
 * furniture consumer on every unrelated store update. */
const NO_FURNITURE: readonly FurnitureInstance[] = []

export function createFurnitureLayout(
  name: string,
  furnitureInstances: FurnitureInstance[] = [],
): FurnitureLayout {
  return { id: crypto.randomUUID(), name: name.trim() || DEFAULT_LAYOUT_NAME, furnitureInstances }
}

/** The layout the tools edit. Falls back to the first layout when
 * `activeFurnitureLayoutId` names one that no longer exists (a hand-edited
 * file, or a delete that raced a stale id), so a dangling id degrades to
 * "shows the first layout" instead of "shows nothing". */
export function activeFurnitureLayout(project: Project): FurnitureLayout | undefined {
  const { furnitureLayouts: layouts, activeFurnitureLayoutId: activeId } = project
  return layouts.find((l) => l.id === activeId) ?? layouts[0]
}

export function findFurnitureLayout(project: Project, layoutId: string): FurnitureLayout | undefined {
  return project.furnitureLayouts.find((l) => l.id === layoutId)
}

/** Furniture of the active layout - the array every editing path reads. */
export function activeFurnitureInstances(project: Project): FurnitureInstance[] {
  return activeFurnitureLayout(project)?.furnitureInstances ?? (NO_FURNITURE as FurnitureInstance[])
}

/** Furniture of one named layout, for read-only comparison panes. */
export function layoutFurniture(project: Project, layoutId: string): FurnitureInstance[] {
  return findFurnitureLayout(project, layoutId)?.furnitureInstances ?? (NO_FURNITURE as FurnitureInstance[])
}

/** Applies `update` to the active layout's furniture, leaving every other
 * layout's array reference untouched so unrelated comparison panes don't
 * re-render. Returns the layouts array; the caller spreads it into a Project. */
export function mapActiveLayoutFurniture(
  project: Project,
  update: (instances: FurnitureInstance[]) => FurnitureInstance[],
): FurnitureLayout[] {
  const active = activeFurnitureLayout(project)
  if (!active) return project.furnitureLayouts
  return project.furnitureLayouts.map((l) =>
    l.id === active.id ? { ...l, furnitureInstances: update(l.furnitureInstances) } : l,
  )
}

/** A copy of `layout` under a new name, with a fresh id for the layout and
 * for every instance in it. Fresh instance ids matter: entity ids are the
 * currency of selection and deletion (`removeEntities`), so two layouts
 * sharing an instance id would let a delete in one silently hit the other. */
export function duplicateFurnitureLayout(layout: FurnitureLayout, name: string): FurnitureLayout {
  return createFurnitureLayout(
    name,
    layout.furnitureInstances.map((f) => ({ ...f, id: crypto.randomUUID() })),
  )
}

/** "Layout 3" / "Kitchen plan (copy) 2" - the first name in the series that
 * isn't taken, so tabs are always distinguishable. Comparison is on the
 * trimmed name, matching how the rename dialog stores it. */
export function uniqueLayoutName(layouts: FurnitureLayout[], base: string): string {
  const taken = new Set(layouts.map((l) => l.name))
  const trimmed = base.trim() || DEFAULT_LAYOUT_NAME
  if (!taken.has(trimmed)) return trimmed
  for (let n = 2; ; n++) {
    const candidate = `${trimmed} ${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Default name for the next brand-new layout: "Layout N", starting one past
 * the current count and skipping any N the user has already renamed something
 * to - so the series stays "Layout 4" rather than "Layout 3 2". */
export function nextLayoutName(layouts: FurnitureLayout[]): string {
  const taken = new Set(layouts.map((l) => l.name))
  for (let n = layouts.length + 1; ; n++) {
    const candidate = `Layout ${n}`
    if (!taken.has(candidate)) return candidate
  }
}
