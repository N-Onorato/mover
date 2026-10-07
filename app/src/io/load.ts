import type { FurnitureLayout, Project } from '../types/project'
import { PROJECT_VERSION, SUPPORTED_PROJECT_VERSIONS } from '../types/project'
import { DEFAULT_LAYOUT_NAME, createFurnitureLayout } from '../project/layouts'
import { DEFAULT_SQUARE_CORNERS_TOLERANCE_DEG } from '../utils/squareCorners'

export class LoadError extends Error {}

type SettingsMigration = (settings: Record<string, unknown>) => void

// Each entry backfills one ProjectSettings field that may be missing from
// older saved projects. Add a new entry here when a new settings field with
// a default is introduced — no other changes to parseProject should be
// needed.
const SETTINGS_MIGRATIONS: SettingsMigration[] = [
  (settings) => {
    if (settings.rulerMode === undefined) settings.rulerMode = 'feet-inches'
  },
  (settings) => {
    // Matches DEFAULT_WALL_THICKNESS_IMPERIAL_IN in store/projectStore.ts
    // (the US standard 2x4 wall thickness), introduced in E2.
    if (settings.defaultWallThickness === undefined) settings.defaultWallThickness = 4.5
  },
  (settings) => {
    // O3 (#43): tolerance for "Square corners". Same default newProject() uses.
    if (settings.squareCornersToleranceDeg === undefined) {
      settings.squareCornersToleranceDeg = DEFAULT_SQUARE_CORNERS_TOLERANCE_DEG
    }
  },
]

function migrateSettings(settings: Record<string, unknown>): void {
  for (const migrate of SETTINGS_MIGRATIONS) migrate(settings)
}

export function parseProject(json: string): Project {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new LoadError('File is not valid JSON.')
  }
  if (typeof data !== 'object' || data === null) {
    throw new LoadError('File does not contain a project object.')
  }
  const p = data as Record<string, unknown>
  if (typeof p.version !== 'string' || !SUPPORTED_PROJECT_VERSIONS.includes(p.version)) {
    throw new LoadError(`Unsupported project version: ${p.version}`)
  }
  // TODO: schema validation
  const settings = p.settings as Record<string, unknown> | undefined
  if (settings) migrateSettings(settings)
  // interiorWalls is a top-level Project array added after some saved
  // projects existed; SETTINGS_MIGRATIONS only backfills project.settings
  // fields, so this is handled separately.
  if (!Array.isArray(p.interiorWalls)) p.interiorWalls = []
  if (!Array.isArray(p.customFurnitureDefs)) p.customFurnitureDefs = []
  if (!Array.isArray(p.furnitureSets)) p.furnitureSets = []
  migrateFurnitureLayouts(p)
  // Everything above brings the object up to the current shape, so it is now
  // a PROJECT_VERSION project regardless of what it was saved as - the next
  // save writes that version out.
  p.version = PROJECT_VERSION
  return data as Project
}

/** L1 (#28): pre-1.1 projects carry a single flat `furnitureInstances` array.
 * Wrap it in one default layout so an old `.mover.json` opens with all of its
 * furniture in place, under a layout the user can then duplicate.
 *
 * Also repairs a 1.1 project whose `activeFurnitureLayoutId` names no layout
 * (hand-edited file, or one truncated in transit): the rest of the app treats
 * a dangling id as "first layout", and normalizing it here means a save
 * writes back a consistent file rather than preserving the dangling id. */
function migrateFurnitureLayouts(p: Record<string, unknown>): void {
  if (!Array.isArray(p.furnitureLayouts) || p.furnitureLayouts.length === 0) {
    const legacy = Array.isArray(p.furnitureInstances) ? p.furnitureInstances : []
    p.furnitureLayouts = [createFurnitureLayout(DEFAULT_LAYOUT_NAME, legacy)]
  }
  // Dropped rather than kept alongside: leaving it would let an old build
  // re-open the file and silently edit an array nothing else reads.
  delete p.furnitureInstances

  const layouts = p.furnitureLayouts as FurnitureLayout[]
  if (!layouts.some((l) => l.id === p.activeFurnitureLayoutId)) {
    p.activeFurnitureLayoutId = layouts[0].id
  }
}

export function loadFromLocalStorage(): Project | null {
  try {
    const raw = localStorage.getItem('mover:autosave')
    if (!raw) return null
    return parseProject(raw)
  } catch {
    return null
  }
}

export function openProjectFile(): Promise<Project> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.mover.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return reject(new LoadError('No file selected.'))
      const reader = new FileReader()
      reader.onload = () => {
        try {
          resolve(parseProject(reader.result as string))
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = () => reject(new LoadError('Failed to read file.'))
      reader.readAsText(file)
    }
    input.click()
  })
}
