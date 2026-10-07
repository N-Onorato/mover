import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../store/uiStore'
import { activeFurnitureInstances } from '../project/layouts'
import type { Room, InteriorWall, FurnitureInstance, ReferenceImage } from '../types/project'

export type SelectedEntity =
  | { type: 'room'; room: Room }
  | { type: 'interiorWall'; wall: InteriorWall }
  | { type: 'furniture'; furniture: FurnitureInstance }
  | { type: 'referenceImage'; image: ReferenceImage }
  | null

/** The single selected entity, or null when zero or several are selected.
 * Furniture is looked up in the active layout - the only editable one. Each
 * selector returns a stable entity reference, so callers only re-render when
 * the selected entity itself changes. */
export function useSelectedEntity(): SelectedEntity {
  const id = useUIStore((s) => (s.selectedIds.length === 1 ? s.selectedIds[0] : null))
  const room = useProjectStore((s) => (id ? s.project.rooms.find((r) => r.id === id) : undefined))
  const wall = useProjectStore((s) => (id ? s.project.interiorWalls.find((w) => w.id === id) : undefined))
  const furniture = useProjectStore((s) =>
    id ? activeFurnitureInstances(s.project).find((f) => f.id === id) : undefined,
  )
  const image = useProjectStore((s) => (id ? s.project.referenceImages.find((i) => i.id === id) : undefined))

  if (room) return { type: 'room', room }
  if (wall) return { type: 'interiorWall', wall }
  if (furniture) return { type: 'furniture', furniture }
  if (image) return { type: 'referenceImage', image }
  return null
}
