import { create } from 'zustand'
import type {
  Project,
  Room,
  FurnitureInstance,
  FurnitureDefinition,
  ReferenceImage,
  Annotation,
} from '../types/project'

function newProject(): Project {
  return {
    version: '1.0',
    id: crypto.randomUUID(),
    name: 'Untitled Layout',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    settings: {
      units: 'imperial',
      gridSize: 12,
      snapToGrid: true,
      snapToWalls: true,
      defaultWallThickness: 6,
      backgroundColor: '#f5f5f0',
    },
    rooms: [],
    furnitureInstances: [],
    customFurnitureDefs: [],
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
  removeEntities: (ids: string[]) => void

  addRoom: (room: Room) => void
  updateRoom: (id: string, patch: Partial<Room>) => void
  removeRoom: (id: string) => void

  addFurniture: (instance: FurnitureInstance) => void
  updateFurniture: (id: string, patch: Partial<FurnitureInstance>) => void
  removeFurniture: (id: string) => void

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
  removeEntities: (ids) =>
    set((s) => {
      const idSet = new Set(ids)
      return {
        project: {
          ...s.project,
          rooms: s.project.rooms.filter((r) => !idSet.has(r.id)),
          furnitureInstances: s.project.furnitureInstances.filter((f) => !idSet.has(f.id)),
          annotations: s.project.annotations.filter((a) => !idSet.has(a.id)),
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
      project: { ...s.project, rooms: s.project.rooms.filter((r) => r.id !== id) },
      isDirty: true,
    })),

  addFurniture: (instance) =>
    set((s) => ({
      project: {
        ...s.project,
        furnitureInstances: [...s.project.furnitureInstances, instance],
      },
      isDirty: true,
    })),
  updateFurniture: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        furnitureInstances: s.project.furnitureInstances.map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        ),
      },
      isDirty: true,
    })),
  removeFurniture: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        furnitureInstances: s.project.furnitureInstances.filter((f) => f.id !== id),
      },
      isDirty: true,
    })),

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
