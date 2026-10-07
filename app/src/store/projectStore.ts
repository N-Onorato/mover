import { create } from 'zustand'
import type {
  Project,
  ProjectSettings,
  Room,
  InteriorWall,
  FurnitureInstance,
  FurnitureLayout,
  FurnitureDefinition,
  ReferenceImage,
  Annotation,
} from '../types/project'
import { PROJECT_VERSION } from '../types/project'
import {
  DEFAULT_LAYOUT_NAME,
  activeFurnitureLayout,
  createFurnitureLayout,
  mapActiveLayoutFurniture,
} from '../project/layouts'

// Length-valued settings (defaultWallThickness, room dimensions, etc.) are
// always stored in the project's native world unit: inches when
// settings.units === 'imperial', centimeters when settings.units === 'metric'
// (same convention used throughout units.ts / parseLength / formatLength).
// New projects are currently always created as imperial, so the default
// below is 4.5" (standard US 2x4 stud wall + drywall on both faces). If a
// metric default project is ever introduced, the equivalent value is
// 11.43cm (4.5in * 2.54).
const DEFAULT_WALL_THICKNESS_IMPERIAL_IN = 4.5

function newProject(): Project {
  const layout = createFurnitureLayout(DEFAULT_LAYOUT_NAME)
  return {
    version: PROJECT_VERSION,
    id: crypto.randomUUID(),
    name: 'Untitled Layout',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    settings: {
      units: 'imperial',
      gridSize: 12,
      snapToGrid: true,
      snapToWalls: true,
      defaultWallThickness: DEFAULT_WALL_THICKNESS_IMPERIAL_IN,
      backgroundColor: '#f5f5f0',
      rulerMode: 'feet-inches',
    },
    rooms: [],
    interiorWalls: [],
    furnitureLayouts: [layout],
    activeFurnitureLayoutId: layout.id,
    customFurnitureDefs: [],
    furnitureSets: [],
    referenceImages: [],
    annotations: [],
  }
}

interface ProjectStore {
  project: Project
  isDirty: boolean

  setProject: (project: Project) => void
  resetProject: () => void
  applySnapshot: (project: Project) => void
  touchModified: () => void
  toggleSnapToGrid: () => void
  toggleRulerMode: () => void
  updateSettings: (patch: Partial<ProjectSettings>) => void
  removeEntities: (ids: string[]) => void

  addRoom: (room: Room) => void
  updateRoom: (id: string, patch: Partial<Room>) => void
  removeRoom: (id: string) => void

  addInteriorWall: (wall: InteriorWall) => void
  updateInteriorWall: (id: string, patch: Partial<InteriorWall>) => void
  removeInteriorWall: (id: string) => void

  // Furniture actions all target the *active* layout (project/layouts.ts).
  // Nothing in the app edits a non-active layout's furniture: to change a
  // layout you switch to it first, which is what the tabs do.
  addFurniture: (instance: FurnitureInstance) => void
  updateFurniture: (id: string, patch: Partial<FurnitureInstance>) => void
  removeFurniture: (id: string) => void

  /** Appends the layout and switches to it - creating a variant you aren't
   * then editing isn't a flow the UI has, and splitting it in two would make
   * "new tab" two store updates (and two autosaves). */
  addFurnitureLayout: (layout: FurnitureLayout) => void
  renameFurnitureLayout: (id: string, name: string) => void
  /** No-op when `id` names the last remaining layout: a project always has at
   * least one furniture layout, so there is always something to render and
   * place into. Removing the active layout activates a neighbour. */
  removeFurnitureLayout: (id: string) => void
  setActiveFurnitureLayout: (id: string) => void

  addCustomDef: (def: FurnitureDefinition) => void
  updateCustomDef: (id: string, patch: Partial<FurnitureDefinition>) => void
  removeCustomDef: (id: string) => void

  addReferenceImage: (image: ReferenceImage) => void
  updateReferenceImage: (id: string, patch: Partial<ReferenceImage>) => void
  removeReferenceImage: (id: string) => void

  addAnnotation: (annotation: Annotation) => void
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void
  removeAnnotation: (id: string) => void

  markSaved: () => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  project: newProject(),
  isDirty: false,

  setProject: (project) => set({ project, isDirty: false }),
  resetProject: () => set({ project: newProject(), isDirty: false }),
  applySnapshot: (project) =>
    set({ project: { ...project, modified: new Date().toISOString() }, isDirty: true }),
  touchModified: () =>
    set((s) => ({
      project: { ...s.project, modified: new Date().toISOString() },
      isDirty: true,
    })),
  toggleSnapToGrid: () =>
    set((s) => ({
      project: {
        ...s.project,
        settings: { ...s.project.settings, snapToGrid: !s.project.settings.snapToGrid },
      },
      isDirty: true,
    })),
  toggleRulerMode: () =>
    set((s) => ({
      project: {
        ...s.project,
        settings: {
          ...s.project.settings,
          rulerMode: s.project.settings.rulerMode === 'feet-inches' ? 'simple' : 'feet-inches',
        },
      },
      isDirty: true,
    })),
  updateSettings: (patch) =>
    set((s) => ({
      project: {
        ...s.project,
        settings: { ...s.project.settings, ...patch },
      },
      isDirty: true,
    })),
  removeEntities: (ids) =>
    set((s) => {
      const idSet = new Set(ids)
      const remainingRooms = s.project.rooms.filter((r) => !idSet.has(r.id))
      const removedRoomIds = new Set(
        s.project.rooms.filter((r) => idSet.has(r.id)).map((r) => r.id),
      )
      return {
        project: {
          ...s.project,
          rooms: remainingRooms,
          interiorWalls: s.project.interiorWalls.filter(
            (w) => !idSet.has(w.id) && !removedRoomIds.has(w.roomId),
          ),
          // Selection can only hold ids from the active layout, but this
          // sweeps every layout so an id that somehow outlived a switch can't
          // leave an orphan behind. Layouts that lose nothing keep their exact
          // object identity, so comparison panes don't re-render on a delete.
          furnitureLayouts: s.project.furnitureLayouts.map((l) => {
            const kept = l.furnitureInstances.filter((f) => !idSet.has(f.id))
            return kept.length === l.furnitureInstances.length
              ? l
              : { ...l, furnitureInstances: kept }
          }),
          annotations: s.project.annotations.filter((a) => !idSet.has(a.id)),
          referenceImages: s.project.referenceImages.filter((img) => !idSet.has(img.id)),
        },
        isDirty: true,
      }
    }),

  addRoom: (room) =>
    set((s) => ({
      project: { ...s.project, rooms: [...s.project.rooms, room] },
      isDirty: true,
    })),
  updateRoom: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        rooms: s.project.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      },
      isDirty: true,
    })),
  removeRoom: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        rooms: s.project.rooms.filter((r) => r.id !== id),
        interiorWalls: s.project.interiorWalls.filter((w) => w.roomId !== id),
      },
      isDirty: true,
    })),

  addInteriorWall: (wall) =>
    set((s) => ({
      project: { ...s.project, interiorWalls: [...s.project.interiorWalls, wall] },
      isDirty: true,
    })),
  updateInteriorWall: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        interiorWalls: s.project.interiorWalls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      },
      isDirty: true,
    })),
  removeInteriorWall: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        interiorWalls: s.project.interiorWalls.filter((w) => w.id !== id),
      },
      isDirty: true,
    })),

  addFurniture: (instance) =>
    set((s) => ({
      project: {
        ...s.project,
        furnitureLayouts: mapActiveLayoutFurniture(s.project, (fs) => [...fs, instance]),
      },
      isDirty: true,
    })),
  updateFurniture: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        furnitureLayouts: mapActiveLayoutFurniture(s.project, (fs) =>
          fs.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        ),
      },
      isDirty: true,
    })),
  removeFurniture: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        furnitureLayouts: mapActiveLayoutFurniture(s.project, (fs) =>
          fs.filter((f) => f.id !== id),
        ),
      },
      isDirty: true,
    })),

  addFurnitureLayout: (layout) =>
    set((s) => ({
      project: {
        ...s.project,
        furnitureLayouts: [...s.project.furnitureLayouts, layout],
        activeFurnitureLayoutId: layout.id,
      },
      isDirty: true,
    })),
  renameFurnitureLayout: (id, name) =>
    set((s) => ({
      project: {
        ...s.project,
        furnitureLayouts: s.project.furnitureLayouts.map((l) =>
          l.id === id ? { ...l, name: name.trim() || l.name } : l,
        ),
      },
      isDirty: true,
    })),
  removeFurnitureLayout: (id) =>
    set((s) => {
      const remaining = s.project.furnitureLayouts.filter((l) => l.id !== id)
      if (remaining.length === 0 || remaining.length === s.project.furnitureLayouts.length) {
        return s
      }
      // Resolve the active layout *before* the removal so deleting a
      // non-active layout can't shift what the user is editing, and deleting
      // the active one lands on a real neighbour rather than a dangling id.
      const activeId = activeFurnitureLayout(s.project)?.id
      return {
        project: {
          ...s.project,
          furnitureLayouts: remaining,
          activeFurnitureLayoutId: activeId === id ? remaining[0].id : (activeId ?? remaining[0].id),
        },
        isDirty: true,
      }
    }),
  setActiveFurnitureLayout: (id) =>
    set((s) =>
      s.project.furnitureLayouts.some((l) => l.id === id)
        ? { project: { ...s.project, activeFurnitureLayoutId: id }, isDirty: true }
        : s,
    ),

  addCustomDef: (def) =>
    set((s) => ({
      project: {
        ...s.project,
        customFurnitureDefs: [...s.project.customFurnitureDefs, def],
      },
      isDirty: true,
    })),
  updateCustomDef: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        customFurnitureDefs: s.project.customFurnitureDefs.map((d) =>
          d.id === id ? { ...d, ...patch } : d,
        ),
      },
      isDirty: true,
    })),
  removeCustomDef: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        customFurnitureDefs: s.project.customFurnitureDefs.filter((d) => d.id !== id),
      },
      isDirty: true,
    })),

  addReferenceImage: (image) =>
    set((s) => ({
      project: {
        ...s.project,
        referenceImages: [...s.project.referenceImages, image],
      },
      isDirty: true,
    })),
  updateReferenceImage: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        referenceImages: s.project.referenceImages.map((img) =>
          img.id === id ? { ...img, ...patch } : img,
        ),
      },
      isDirty: true,
    })),
  removeReferenceImage: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        referenceImages: s.project.referenceImages.filter((img) => img.id !== id),
      },
      isDirty: true,
    })),

  addAnnotation: (annotation) =>
    set((s) => ({
      project: {
        ...s.project,
        annotations: [...s.project.annotations, annotation],
      },
      isDirty: true,
    })),
  updateAnnotation: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        annotations: s.project.annotations.map((a) =>
          a.id === id ? ({ ...a, ...patch } as Annotation) : a,
        ),
      },
      isDirty: true,
    })),
  removeAnnotation: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        annotations: s.project.annotations.filter((a) => a.id !== id),
      },
      isDirty: true,
    })),

  markSaved: () => set({ isDirty: false }),
}))
